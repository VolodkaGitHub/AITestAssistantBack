/**
 * @deprecated This endpoint is deprecated. Use /api/terra/enrichment instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Terra Enrichment Scores API
 * Fetches sleep, stress, and respiratory scores for connected wearable devices
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
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
    console.log(`📊 Fetching enrichment scores for user: ${userId}`);

    // Get user's wearable connections
    const connectionsQuery = `
      SELECT terra_user_id, provider 
      FROM wearable_connections 
      WHERE user_id = $1 AND is_active = true
    `;
    const connectionsResult = await dbPool.query(connectionsQuery, [userId]);

    if (connectionsResult.rows.length === 0) {
      return res.status(200).json({ enrichment_scores: [] });
    }

    const terraUserIds = connectionsResult.rows.map(row => row.terra_user_id);

    // Fetch enrichment scores from enrichment_scores table
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

    const enrichmentScores: EnrichmentScore[] = scoresResult.rows.map(row => ({
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

    console.log(`✅ Found ${enrichmentScores.length} enrichment score entries`);

    // Group scores by type and get latest values
    const latestScores = {
      sleep: enrichmentScores.find(score => score.sleep_score !== null),
      stress: enrichmentScores.find(score => score.stress_score !== null),
      respiratory: enrichmentScores.find(score => score.respiratory_score !== null)
    };

    return res.status(200).json({
      enrichment_scores: enrichmentScores,
      latest_scores: latestScores,
      connections: connectionsResult.rows
    });

  } catch (error) {
    console.error('❌ Error fetching enrichment scores:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}