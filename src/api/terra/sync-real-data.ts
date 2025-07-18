/**
 * @deprecated This endpoint is deprecated. Use /api/terra/sync with sync_type: 'daily' instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Terra Real Data Sync API
 * Manually fetches live enrichment data from Terra API for connected devices
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'
import { authDB } from '../../lib/auth-database';

const dbPool = DatabasePool.getInstance();

interface TerraAPIResponse {
  success: boolean;
  data?: any[];
  message?: string;
}

// Function to store enrichment scores in database
async function storeEnrichmentScore(enrichmentData: any) {
  try {
    const query = `
      INSERT INTO enrichment_scores (
        data_type, provider, terra_user_id, user_id,
        sleep_score, stress_score, respiratory_score,
        sleep_contributors, stress_contributors, respiratory_contributors,
        summary_date, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (terra_user_id, data_type, summary_date) 
      DO UPDATE SET
        sleep_score = EXCLUDED.sleep_score,
        stress_score = EXCLUDED.stress_score,
        respiratory_score = EXCLUDED.respiratory_score,
        sleep_contributors = EXCLUDED.sleep_contributors,
        stress_contributors = EXCLUDED.stress_contributors,
        respiratory_contributors = EXCLUDED.respiratory_contributors,
        recorded_at = EXCLUDED.recorded_at
    `;
    
    // Find the user_id from the Terra user ID
    const userQuery = `SELECT user_id FROM wearable_connections WHERE terra_user_id = $1 LIMIT 1`;
    const userResult = await dbPool.query(userQuery, [enrichmentData.terra_user_id]);
    const userId = userResult.rows[0]?.user_id || enrichmentData.terra_user_id;
    
    await dbPool.query(query, [
      enrichmentData.data_type,
      enrichmentData.provider,
      enrichmentData.terra_user_id,
      userId,
      enrichmentData.sleep_score,
      enrichmentData.stress_score,
      enrichmentData.respiratory_score,
      enrichmentData.sleep_contributors,
      enrichmentData.stress_contributors,
      enrichmentData.respiratory_contributors,
      enrichmentData.summary_date,
      enrichmentData.recorded_at
    ]);
    
    console.log(`✅ Stored enrichment score: ${enrichmentData.data_type} for Terra user ${enrichmentData.terra_user_id}`);
  } catch (error) {
    console.error('Error storing enrichment score:', error);
  }
}

// Function to fetch Terra data via API
async function fetchTerraData(terraUserId: string, dataType: string, provider: string) {
  try {
    const terraApiKey = process.env.TERRA_API_KEY_PROD;
    const terraDevId = process.env.TERRA_DEV_ID_PROD;
    
    if (!terraApiKey || !terraDevId) {
      throw new Error('Missing Terra production credentials');
    }

    // Calculate date range (last 30 days for better data coverage)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];

    const endpoint = `https://api.tryterra.co/v2/${dataType}`;
    const url = `${endpoint}?user_id=${terraUserId}&start_date=${formattedStartDate}&end_date=${formattedEndDate}`;
    
    console.log(`🔄 Fetching Terra ${dataType} data:`, { terraUserId, provider, url });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'dev-id': terraDevId,
        'X-API-Key': terraApiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Terra API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`📊 Terra ${dataType} response:`, {
      user: data.user,
      data_count: data.data?.length || 0
    });

    return data;
  } catch (error) {
    console.error(`Error fetching Terra ${dataType} data:`, error);
    throw error;
  }
}

// Function to extract and store enrichment data
async function processEnrichmentData(terraUserId: string, provider: string, dataType: string, data: any[]) {
  console.log(`🎯 Processing ${dataType} enrichment data:`, {
    terra_user_id: terraUserId,
    provider: provider,
    data_count: data.length
  });
  
  for (const dataEntry of data) {
    const enrichmentData = dataEntry.data_enrichment;
    
    if (!enrichmentData) {
      console.log(`⚠️ No enrichment data found in ${dataType} entry`);
      continue;
    }

    console.log(`🎯 Found ${dataType} enrichment data:`, {
      sleep_score: enrichmentData.sleep_score,
      stress_score: enrichmentData.stress_score,
      respiratory_score: enrichmentData.respiratory_score,
      contributors: Object.keys(enrichmentData).filter(key => key.includes('contributors'))
    });

    // Use current date as fallback if summary_date is missing
    const recordDate = dataEntry.summary_date ? new Date(dataEntry.summary_date) : new Date();

    // Store enrichment scores based on type
    const enrichmentScores = {
      data_type: dataType,
      provider: provider,
      terra_user_id: terraUserId,
      
      // Sleep enrichment scores
      sleep_score: enrichmentData.sleep_score || null,
      sleep_contributors: enrichmentData.sleep_contributors || null,
      
      // Stress enrichment scores  
      stress_score: enrichmentData.stress_score || null,
      stress_contributors: enrichmentData.stress_contributors || null,
      
      // Respiratory enrichment scores
      respiratory_score: enrichmentData.respiratory_score || null,
      respiratory_contributors: enrichmentData.respiratory_contributors || null,
      
      // Metadata
      summary_date: dataEntry.summary_date,
      recorded_at: recordDate.toISOString(),
      synced_at: new Date().toISOString()
    };

    // Store enrichment data in the enrichment_scores table
    await storeEnrichmentScore(enrichmentScores);

    console.log(`✅ Stored ${dataType} enrichment scores for Terra user ${terraUserId}`);
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Validate user session
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionToken) {
      return res.status(401).json({ message: 'No session token provided' });
    }

    await authDB.initializeSchema();
    const sessionData = await authDB.validateSession(sessionToken);
    if (!sessionData) {
      return res.status(401).json({ message: 'Invalid session' });
    }

    const userId = sessionData.id;
    console.log(`🔄 Starting real data sync for user: ${userId}`);

    // Get user's Terra connections
    const connectionsQuery = `
      SELECT terra_user_id, provider 
      FROM wearable_connections 
      WHERE user_id = $1 AND is_active = true
    `;
    const connectionsResult = await dbPool.query(connectionsQuery, [userId]);

    if (connectionsResult.rows.length === 0) {
      return res.status(200).json({ 
        success: false, 
        message: 'No active Terra connections found' 
      });
    }

    const syncResults = [];

    for (const connection of connectionsResult.rows) {
      const { terra_user_id, provider } = connection;
      
      console.log(`🔄 Syncing data for Terra user: ${terra_user_id} (${provider})`);

      // Fetch different data types that might contain enrichment scores
      const dataTypes = ['sleep', 'daily', 'activity', 'body'];
      
      for (const dataType of dataTypes) {
        try {
          const terraData = await fetchTerraData(terra_user_id, dataType, provider);
          
          if (terraData.data && terraData.data.length > 0) {
            await processEnrichmentData(terra_user_id, provider, dataType, terraData.data);
            syncResults.push({
              terra_user_id,
              provider,
              data_type: dataType,
              records_processed: terraData.data.length,
              success: true
            });
          } else {
            console.log(`⚠️ No ${dataType} data found for Terra user ${terra_user_id}`);
          }
        } catch (error) {
          console.error(`Error processing ${dataType} for ${terra_user_id}:`, error);
          syncResults.push({
            terra_user_id,
            provider,
            data_type: dataType,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    console.log(`✅ Real data sync completed for user ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Real data sync completed',
      sync_results: syncResults
    });

  } catch (error) {
    console.error('Error in real data sync:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync real data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}