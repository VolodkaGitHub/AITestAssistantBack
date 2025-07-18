/**
 * Terra Scheduled Data Sync
 * Pulls enrichment data for all users on schedule instead of relying on webhooks
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

interface SyncResult {
  success: boolean;
  users_processed: number;
  enrichment_scores_updated: number;
  errors: string[];
  processing_time_ms: number;
}

// Get Terra API credentials
const TERRA_API_KEY = process.env.TERRA_API_KEY_PROD;
const TERRA_DEV_ID = process.env.TERRA_DEV_ID_PROD;

async function fetchTerraEnrichmentData(terraUserId: string, dataType: string) {
  try {
    const response = await fetch(`https://api.tryterra.co/v2/${dataType}?user_id=${terraUserId}&start_date=${getDateString(7)}&end_date=${getDateString(0)}`, {
      headers: {
        'dev-id': TERRA_DEV_ID!,
        'x-api-key': TERRA_API_KEY!,
      }
    });

    if (!response.ok) {
      console.log(`Terra API error for user ${terraUserId}, ${dataType}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching Terra ${dataType} for user ${terraUserId}:`, error);
    return null;
  }
}

function getDateString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

async function extractAndStoreEnrichmentScores(terraData: any, userId: string, terraUserId: string, provider: string, dataType: string, dbPool: any) {
  if (!terraData?.data) return 0;

  let scoresStored = 0;

  for (const dataEntry of terraData.data) {
    const enrichment = dataEntry.data_enrichment;
    if (!enrichment) continue;

    const summaryDate = dataEntry.summary_date || dataEntry.metadata?.start_time || new Date().toISOString().split('T')[0];
    
    try {
      const query = `
        INSERT INTO enrichment_scores (
          user_id, provider, terra_user_id, data_type,
          sleep_score, stress_score, respiratory_score,
          sleep_contributors, stress_contributors, respiratory_contributors,
          immune_index, immune_contributors,
          summary_date, recorded_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (user_id, provider, data_type, summary_date) 
        DO UPDATE SET
          sleep_score = EXCLUDED.sleep_score,
          stress_score = EXCLUDED.stress_score,
          respiratory_score = EXCLUDED.respiratory_score,
          sleep_contributors = EXCLUDED.sleep_contributors,
          stress_contributors = EXCLUDED.stress_contributors,
          respiratory_contributors = EXCLUDED.respiratory_contributors,
          immune_index = EXCLUDED.immune_index,
          immune_contributors = EXCLUDED.immune_contributors,
          recorded_at = EXCLUDED.recorded_at,
          updated_at = EXCLUDED.updated_at
      `;

      await dbPool.query(query, [
        userId,
        provider,
        terraUserId,
        dataType,
        enrichment.sleep_score || null,
        enrichment.stress_score || enrichment.total_stress_score || null,
        enrichment.respiratory_score || null,
        enrichment.sleep_contributors ? JSON.stringify(enrichment.sleep_contributors) : null,
        enrichment.stress_contributors ? JSON.stringify(enrichment.stress_contributors) : null,
        enrichment.respiratory_contributors ? JSON.stringify(enrichment.respiratory_contributors) : null,
        enrichment.immune_index || null,
        enrichment.immune_contributors ? JSON.stringify(enrichment.immune_contributors) : null,
        summaryDate,
        new Date(),
        new Date()
      ]);

      scoresStored++;
      
      console.log(`✅ Stored ${dataType} enrichment scores for user ${userId}: Sleep: ${enrichment.sleep_score}, Stress: ${enrichment.stress_score || enrichment.total_stress_score}, Respiratory: ${enrichment.respiratory_score}`);

      // Update daily health scores
      try {
        const { dailyHealthAggregator } = await import('../../lib/daily-health-aggregator');
        const scoreDate = summaryDate.split('T')[0];
        await dailyHealthAggregator.aggregateUserDayScores(userId, scoreDate);
      } catch (error) {
        console.error('Error updating daily health scores:', error);
      }

    } catch (error) {
      console.error(`Error storing enrichment scores for user ${userId}:`, error);
    }
  }

  return scoresStored;
}

async function syncUserEnrichmentData(userId: string, terraUserId: string, provider: string, dbPool: any) {
  const dataTypes = ['daily', 'sleep', 'activity', 'body'];
  let totalScoresStored = 0;

  console.log(`🔄 Syncing enrichment data for user ${userId} (Terra: ${terraUserId})`);

  for (const dataType of dataTypes) {
    try {
      const terraData = await fetchTerraEnrichmentData(terraUserId, dataType);
      if (terraData) {
        const scoresStored = await extractAndStoreEnrichmentScores(terraData, userId, terraUserId, provider, dataType, dbPool);
        totalScoresStored += scoresStored;
      }
    } catch (error) {
      console.error(`Error syncing ${dataType} for user ${userId}:`, error);
    }
  }

  return totalScoresStored;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SyncResult>
) {
  const startTime = Date.now();
  
  console.log('🕒 SCHEDULED TERRA ENRICHMENT SYNC STARTED:', new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      users_processed: 0,
      enrichment_scores_updated: 0,
      errors: ['Method not allowed'],
      processing_time_ms: Date.now() - startTime
    });
  }

  try {
    // Get all active wearable connections
    const connectionsQuery = `
      SELECT user_id, terra_user_id, provider 
      FROM wearable_connections 
      WHERE is_active = true AND terra_user_id IS NOT NULL
    `;
    
    const dbPool = DatabasePool.getInstance();
    const connectionsResult = await dbPool.query(connectionsQuery);
    const connections = connectionsResult.rows;

    console.log(`📋 Found ${connections.length} active wearable connections to sync`);

    let totalEnrichmentScores = 0;
    const errors: string[] = [];

    // Process each user's enrichment data
    for (const connection of connections) {
      try {
        const scoresStored = await syncUserEnrichmentData(
          connection.user_id, 
          connection.terra_user_id, 
          connection.provider,
          dbPool
        );
        totalEnrichmentScores += scoresStored;
        
        console.log(`✅ Completed sync for user ${connection.user_id}: ${scoresStored} enrichment scores updated`);
        
      } catch (error) {
        const errorMsg = `Failed to sync user ${connection.user_id}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    const processingTime = Date.now() - startTime;

    console.log(`🎯 SCHEDULED SYNC COMPLETED: ${connections.length} users, ${totalEnrichmentScores} enrichment scores, ${processingTime}ms`);

    return res.status(200).json({
      success: true,
      users_processed: connections.length,
      enrichment_scores_updated: totalEnrichmentScores,
      errors,
      processing_time_ms: processingTime
    });

  } catch (error) {
    console.error('Scheduled sync error:', error);
    return res.status(500).json({
      success: false,
      users_processed: 0,
      enrichment_scores_updated: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      processing_time_ms: Date.now() - startTime
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}