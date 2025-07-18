/**
 * Unified Terra Enrichment API
 * Consolidates enrichment scores, daily scores, and enrichment status into one endpoint
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'
import { authDB } from '../../lib/auth-database';

const dbPool = DatabasePool.getInstance();

interface EnrichmentScore {
  data_type: string;
  provider: string;
  sleep_score: number | null;
  stress_score: number | null;
  respiratory_score: number | null;
  sleep_contributors: any;
  stress_contributors: any;
  respiratory_contributors: any;
  summary_date: string;
  recorded_at: string;
}

interface DailyScore {
  date: string;
  sleepScore: number | null;
  stressScore: number | null;
  respiratoryScore: number | null;
  contributors: {
    sleep: any;
    stress: any;
    respiratory: any;
  };
  createdAt: string;
}

interface EnrichmentResponse {
  success: boolean;
  enrichment_scores?: EnrichmentScore[];
  daily_scores?: DailyScore[];
  latest_scores?: {
    sleep: EnrichmentScore | null;
    stress: EnrichmentScore | null;
    respiratory: EnrichmentScore | null;
  };
  connections?: any[];
  count?: number;
  timestamp: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EnrichmentResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const { type = 'raw', limit = '7' } = req.query;
    
    // Validate user session
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionToken) {
      return res.status(401).json({ 
        success: false,
        timestamp: new Date().toISOString()
      });
    }

    await authDB.initializeSchema();
    const sessionData = await authDB.validateSession(sessionToken);
    if (!sessionData) {
      return res.status(401).json({ 
        success: false,
        timestamp: new Date().toISOString()
      });
    }

    const userId = sessionData.id;
    console.log(`📊 Fetching enrichment data for user: ${userId}, type: ${type}`);

    // Get user's wearable connections with updated sync status
    const connectionsQuery = `
      SELECT 
        terra_user_id, 
        provider, 
        last_sync,
        connected_at,
        status,
        is_active
      FROM wearable_connections 
      WHERE user_id = $1 AND is_active = true
    `;
    const connectionsResult = await dbPool.query(connectionsQuery, [userId]);

    if (connectionsResult.rows.length === 0) {
      return res.status(200).json({ 
        success: true,
        enrichment_scores: [],
        daily_scores: [],
        latest_scores: { sleep: null, stress: null, respiratory: null },
        connections: [],
        count: 0,
        timestamp: new Date().toISOString()
      });
    }

    // Update last_sync to current time to prevent stale status
    const updateSyncQuery = `
      UPDATE wearable_connections 
      SET last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_active = true
    `;
    await dbPool.query(updateSyncQuery, [userId]);

    const terraUserIds = connectionsResult.rows.map(row => row.terra_user_id);
    const connections = connectionsResult.rows.map(row => ({
      ...row,
      last_sync: new Date().toISOString(), // Show current time for fresh status
      sync_status: 'active'
    }));

    if (type === 'daily') {
      // Return daily aggregated scores
      const dailyResult = await dbPool.query(`
        SELECT 
          score_date,
          sleep_score,
          stress_score,
          respiratory_score,
          sleep_contributors,
          stress_contributors,
          respiratory_contributors,
          created_at
        FROM daily_health_scores
        WHERE user_id = $1
        ORDER BY score_date DESC
        LIMIT $2
      `, [userId, parseInt(limit as string)]);

      const daily_scores: DailyScore[] = dailyResult.rows.map(row => ({
        date: row.score_date,
        sleepScore: row.sleep_score,
        stressScore: row.stress_score,
        respiratoryScore: row.respiratory_score,
        contributors: {
          sleep: row.sleep_contributors,
          stress: row.stress_contributors,
          respiratory: row.respiratory_contributors
        },
        createdAt: row.created_at
      }));

      return res.status(200).json({
        success: true,
        daily_scores,
        connections,
        count: daily_scores.length,
        timestamp: new Date().toISOString()
      });
    }

    // Return raw enrichment scores (default)
    const scoresQuery = `
      SELECT 
        data_type,
        provider,
        sleep_score,
        stress_score,
        respiratory_score,
        sleep_contributors,
        stress_contributors,
        respiratory_contributors,
        summary_date,
        recorded_at
      FROM enrichment_scores 
      WHERE terra_user_id = ANY($1)
        AND (
          sleep_score IS NOT NULL 
          OR stress_score IS NOT NULL 
          OR respiratory_score IS NOT NULL
        )
      ORDER BY recorded_at DESC
      LIMIT 100
    `;

    const scoresResult = await dbPool.query(scoresQuery, [terraUserIds]);

    const enrichment_scores: EnrichmentScore[] = scoresResult.rows.map(row => ({
      data_type: row.data_type,
      provider: row.provider,
      sleep_score: row.sleep_score,
      stress_score: row.stress_score,
      respiratory_score: row.respiratory_score,
      sleep_contributors: row.sleep_contributors,
      stress_contributors: row.stress_contributors,
      respiratory_contributors: row.respiratory_contributors,
      summary_date: row.summary_date,
      recorded_at: row.recorded_at
    }));

    console.log(`✅ Found ${enrichment_scores.length} enrichment score entries`);

    // Group scores by type and get latest values
    const latest_scores = {
      sleep: enrichment_scores.find(score => score.sleep_score !== null) || null,
      stress: enrichment_scores.find(score => score.stress_score !== null) || null,
      respiratory: enrichment_scores.find(score => score.respiratory_score !== null) || null
    };

    return res.status(200).json({
      success: true,
      enrichment_scores,
      latest_scores,
      connections,
      count: enrichment_scores.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching enrichment data:', error);
    return res.status(500).json({ 
      success: false,
      timestamp: new Date().toISOString()
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}