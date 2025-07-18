/**
 * @deprecated This endpoint is deprecated. Use /api/terra/data?data_type=activity&provider=device_name instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Terra Enrichment Scores by Device
 * Shows enrichment scores grouped by wearable device/provider
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

const dbPool = DatabasePool.getInstance();

interface DeviceEnrichmentSummary {
  provider: string;
  terraUserId: string;
  userId: string;
  latestScores: {
    sleep_score?: number;
    stress_score?: number;
    respiratory_score?: number;
    immune_index?: number;
  };
  scoreHistory: Array<{
    summary_date: string;
    data_type: string;
    sleep_score?: number;
    stress_score?: number;
    respiratory_score?: number;
    immune_index?: number;
    recorded_at: string;
  }>;
  totalScoresCollected: number;
  lastUpdated: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('📊 ENRICHMENT SCORES BY DEVICE CHECK');

  try {
    // Get enrichment scores grouped by provider
    const enrichmentQuery = `
      SELECT 
        es.provider,
        es.terra_user_id,
        es.user_id,
        es.data_type,
        es.summary_date,
        es.sleep_score,
        es.stress_score,
        es.respiratory_score,
        es.immune_index,
        es.recorded_at,
        wc.user_id as connection_user_id
      FROM enrichment_scores es
      LEFT JOIN wearable_connections wc ON es.terra_user_id = wc.terra_user_id
      ORDER BY es.provider, es.recorded_at DESC
    `;
    
    const enrichmentResult = await dbPool.query(enrichmentQuery);
    const enrichmentData = enrichmentResult.rows;

    // Group by provider/device
    const deviceSummaries: { [key: string]: DeviceEnrichmentSummary } = {};

    for (const score of enrichmentData) {
      const deviceKey = `${score.provider}-${score.terra_user_id}`;
      
      if (!deviceSummaries[deviceKey]) {
        deviceSummaries[deviceKey] = {
          provider: score.provider,
          terraUserId: score.terra_user_id,
          userId: score.connection_user_id || score.user_id,
          latestScores: {},
          scoreHistory: [],
          totalScoresCollected: 0,
          lastUpdated: score.recorded_at
        };
      }

      const summary = deviceSummaries[deviceKey];
      
      // Add to history
      summary.scoreHistory.push({
        summary_date: score.summary_date,
        data_type: score.data_type,
        sleep_score: score.sleep_score,
        stress_score: score.stress_score,
        respiratory_score: score.respiratory_score,
        immune_index: score.immune_index,
        recorded_at: score.recorded_at
      });

      // Update latest scores (most recent values)
      if (score.sleep_score && !summary.latestScores.sleep_score) {
        summary.latestScores.sleep_score = score.sleep_score;
      }
      if (score.stress_score && !summary.latestScores.stress_score) {
        summary.latestScores.stress_score = score.stress_score;
      }
      if (score.respiratory_score && !summary.latestScores.respiratory_score) {
        summary.latestScores.respiratory_score = score.respiratory_score;
      }
      if (score.immune_index && !summary.latestScores.immune_index) {
        summary.latestScores.immune_index = score.immune_index;
      }

      summary.totalScoresCollected++;
    }

    const devicesList = Object.values(deviceSummaries);

    console.log(`📱 Found enrichment data for ${devicesList.length} devices:`);
    devicesList.forEach(device => {
      console.log(`  ${device.provider}: ${device.totalScoresCollected} scores, Latest: Sleep=${device.latestScores.sleep_score}, Stress=${device.latestScores.stress_score}, Respiratory=${device.latestScores.respiratory_score}`);
    });

    return res.status(200).json({
      success: true,
      devicesWithEnrichmentScores: devicesList.length,
      devices: devicesList,
      summary: {
        totalDevices: devicesList.length,
        totalEnrichmentScores: enrichmentData.length,
        providerBreakdown: devicesList.reduce((acc, device) => {
          acc[device.provider] = (acc[device.provider] || 0) + device.totalScoresCollected;
          return acc;
        }, {} as { [key: string]: number })
      }
    });

  } catch (error) {
    console.error('Enrichment by device check error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}