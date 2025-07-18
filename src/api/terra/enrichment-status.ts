/**
 * @deprecated This endpoint is deprecated. Use /api/terra/data?data_type=freshness instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Terra Enrichment Status Check
 * Quick endpoint to check Terra API data availability and enrichment scores
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

const dbPool = DatabasePool.getInstance();

const TERRA_API_KEY = process.env.TERRA_API_KEY_PROD;
const TERRA_DEV_ID = process.env.TERRA_DEV_ID_PROD;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('🔍 TERRA ENRICHMENT STATUS CHECK');

  try {
    // Get active connections
    const connectionsQuery = `
      SELECT user_id, terra_user_id, provider, updated_at 
      FROM wearable_connections 
      WHERE is_active = true AND terra_user_id IS NOT NULL
    `;
    
    const connectionsResult = await dbPool.query(connectionsQuery);
    const connections = connectionsResult.rows;

    console.log(`📋 Found ${connections.length} active connections`);

    const statusResults = [];

    for (const connection of connections) {
      const { user_id: userId, terra_user_id: terraUserId, provider } = connection;
      
      try {
        // Check Terra API data availability - wider date range
        const startDate = '2025-06-01';
        const endDate = '2025-07-06';
        
        const dailyResponse = await fetch(`https://api.tryterra.co/v2/daily?user_id=${terraUserId}&start_date=${startDate}&end_date=${endDate}`, {
          headers: {
            'dev-id': TERRA_DEV_ID!,
            'x-api-key': TERRA_API_KEY!,
          }
        });

        const dailyData = await dailyResponse.json();
        
        const connectionStatus = {
          userId,
          terraUserId,
          provider,
          terraApiStatus: dailyResponse.ok ? 'Connected' : 'Error',
          terraDataCount: dailyData?.data?.length || 0,
          hasEnrichmentData: false,
          enrichmentSample: null as any,
          enrichmentScoresStored: 0
        };

        // Check for enrichment data in Terra response
        if (dailyData?.data?.length > 0) {
          for (const entry of dailyData.data) {
            if (entry.data_enrichment) {
              connectionStatus.hasEnrichmentData = true;
              connectionStatus.enrichmentSample = {
                date: entry.summary_date,
                sleep_score: entry.data_enrichment.sleep_score,
                stress_score: entry.data_enrichment.stress_score || entry.data_enrichment.total_stress_score,
                respiratory_score: entry.data_enrichment.respiratory_score,
                immune_index: entry.data_enrichment.immune_index
              };
              break;
            }
          }
        }

        // Check stored enrichment scores in our database
        const storedQuery = `
          SELECT COUNT(*) as count 
          FROM enrichment_scores 
          WHERE user_id = $1 AND recorded_at > NOW() - INTERVAL '7 days'
        `;
        const storedResult = await dbPool.query(storedQuery, [userId]);
        connectionStatus.enrichmentScoresStored = parseInt(storedResult.rows[0].count);

        statusResults.push(connectionStatus);
        
        console.log(`📊 Status for ${provider} user ${userId}:`, {
          terraDataCount: connectionStatus.terraDataCount,
          hasEnrichment: connectionStatus.hasEnrichmentData,
          storedScores: connectionStatus.enrichmentScoresStored
        });

      } catch (error) {
        console.error(`Error checking status for user ${userId}:`, error);
        statusResults.push({
          userId,
          terraUserId,
          provider,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return res.status(200).json({
      success: true,
      connectionsFound: connections.length,
      statusResults,
      summary: {
        totalConnections: connections.length,
        connectionsWithTerraData: statusResults.filter(s => 'terraDataCount' in s && s.terraDataCount > 0).length,
        connectionsWithEnrichment: statusResults.filter(s => 'hasEnrichmentData' in s && s.hasEnrichmentData).length,
        totalEnrichmentScoresStored: statusResults.reduce((sum, s) => sum + ('enrichmentScoresStored' in s ? s.enrichmentScoresStored || 0 : 0), 0)
      }
    });

  } catch (error) {
    console.error('Enrichment status check error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}