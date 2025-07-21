/**
 * @deprecated This endpoint is deprecated. Use /api/terra/sync with sync_type: 'enrichment' instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Terra Backfill Daily Scores
 * Triggers re-aggregation of daily scores using new averaging system
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { dailyHealthAggregator } from '../../lib/daily-health-aggregator';

/**
 * @openapi
 * /api/terra/backfill-daily-scores:
 *   post:
 *     summary: Re-aggregate daily scores with the new averaging system
 *     description: Deprecated. Use /api/terra/sync with sync_type: 'enrichment' instead.
 *     tags:
 *       - Terra
 *     responses:
 *       200:
 *         description: Daily scores backfill completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Daily scores backfill completed with device averaging
 *       405:
 *         description: Method not allowed (only POST supported)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error during backfill process
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Detailed error message
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('🔄 BACKFILL DAILY SCORES WITH AVERAGING');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Initialize schema first
    await dailyHealthAggregator.initializeSchema();
    
    // Run the backfill with new averaging logic
    await dailyHealthAggregator.backfillDailyScores();

    return res.status(200).json({
      success: true,
      message: 'Daily scores backfill completed with device averaging'
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}