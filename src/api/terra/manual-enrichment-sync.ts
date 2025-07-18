/**
 * @deprecated This endpoint is deprecated. Use /api/terra/sync with sync_type: 'enrichment' instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Manual Terra Enrichment Sync
 * Allows manual triggering of enrichment data sync for testing and immediate updates
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

const dbPool = DatabasePool.getInstance();

interface ManualSyncResult {
  success: boolean;
  message: string;
  enrichment_scores_found: number;
  data_types_processed: string[];
  processing_time_ms: number;
}

const TERRA_API_KEY = process.env.TERRA_API_KEY_PROD;
const TERRA_DEV_ID = process.env.TERRA_DEV_ID_PROD;

async function fetchTerraEnrichmentData(terraUserId: string, dataType: string, startDate: string, endDate: string) {
  try {
    const url = `https://api.tryterra.co/v2/${dataType}?user_id=${terraUserId}&start_date=${startDate}&end_date=${endDate}`;
    
    console.log(`🔍 Fetching Terra ${dataType} enrichment data:`, {
      url,
      terraUserId,
      dateRange: `${startDate} to ${endDate}`
    });

    const response = await fetch(url, {
      headers: {
        'dev-id': TERRA_DEV_ID!,
        'x-api-key': TERRA_API_KEY!,
      }
    });

    if (!response.ok) {
      console.log(`❌ Terra API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log(`📊 Terra ${dataType} response:`, {
      dataCount: data?.data?.length || 0,
      hasEnrichment: data?.data?.[0]?.data_enrichment ? 'Yes' : 'No'
    });

    return data;
  } catch (error) {
    console.error(`Error fetching Terra ${dataType}:`, error);
    return null;
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ManualSyncResult>
) {
  const startTime = Date.now();
  
  console.log('🚀 MANUAL TERRA ENRICHMENT SYNC TRIGGERED:', new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      enrichment_scores_found: 0,
      data_types_processed: [],
      processing_time_ms: Date.now() - startTime
    });
  }

  try {
    // Get the first active wearable connection for testing
    const connectionQuery = `
      SELECT user_id, terra_user_id, provider 
      FROM wearable_connections 
      WHERE is_active = true AND terra_user_id IS NOT NULL
      LIMIT 1
    `;
    
    const connectionResult = await dbPool.query(connectionQuery);
    
    if (connectionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active wearable connections found',
        enrichment_scores_found: 0,
        data_types_processed: [],
        processing_time_ms: Date.now() - startTime
      });
    }

    const connection = connectionResult.rows[0];
    const { user_id: userId, terra_user_id: terraUserId, provider } = connection;

    console.log(`📋 Processing manual sync for:`, {
      userId,
      terraUserId,
      provider
    });

    // Date range: last 7 days
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dataTypes = ['daily', 'sleep', 'activity', 'body'];
    const dataTypesProcessed: string[] = [];
    let totalEnrichmentScores = 0;

    for (const dataType of dataTypes) {
      try {
        const terraData = await fetchTerraEnrichmentData(terraUserId, dataType, startDate, endDate);
        
        if (terraData?.data) {
          dataTypesProcessed.push(dataType);
          
          // Count enrichment scores found
          for (const dataEntry of terraData.data) {
            if (dataEntry.data_enrichment) {
              totalEnrichmentScores++;
              
              const enrichment = dataEntry.data_enrichment;
              console.log(`🎯 Found ${dataType} enrichment:`, {
                date: dataEntry.summary_date || dataEntry.metadata?.start_time,
                sleep_score: enrichment.sleep_score,
                stress_score: enrichment.stress_score || enrichment.total_stress_score,
                respiratory_score: enrichment.respiratory_score,
                immune_index: enrichment.immune_index
              });

              // Store enrichment score
              const summaryDate = dataEntry.summary_date || dataEntry.metadata?.start_time || new Date().toISOString().split('T')[0];
              
              const storeQuery = `
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

              await dbPool.query(storeQuery, [
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

              // Update daily health scores
              try {
                const { dailyHealthAggregator } = await import('../../lib/daily-health-aggregator');
                const scoreDate = summaryDate.split('T')[0];
                await dailyHealthAggregator.aggregateUserDayScores(userId, scoreDate);
              } catch (error) {
                console.error('Error updating daily health scores:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error processing ${dataType}:`, error);
      }
    }

    const processingTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      message: `Manual sync completed for user ${userId}`,
      enrichment_scores_found: totalEnrichmentScores,
      data_types_processed: dataTypesProcessed,
      processing_time_ms: processingTime
    });

  } catch (error) {
    console.error('Manual sync error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      enrichment_scores_found: 0,
      data_types_processed: [],
      processing_time_ms: Date.now() - startTime
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}