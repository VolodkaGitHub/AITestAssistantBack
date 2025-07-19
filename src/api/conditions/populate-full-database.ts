/**
 * Full Conditions Database Population from Merlin API
 * One-time complete population of all conditions
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { conditionsDatabase } from '../../lib/conditions-database';

interface PopulateResponse {
  success: boolean;
  message: string;
  conditions_count?: number;
  already_populated?: boolean;
  error?: string;
}

/**
 * @openapi
 * /api/conditions/populate-full-database:
 *   post:
 *     summary: Populate all conditions from Merlin API
 *     description: Performs a one-time full population of the conditions database by fetching all conditions from the external Merlin API.
 *     tags:
 *       - Conditions
 *     responses:
 *       200:
 *         description: Successfully populated the conditions database
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
 *                   example: Successfully populated conditions database with 123 conditions from Merlin API
 *                 conditions_count:
 *                   type: integer
 *                   example: 123
 *                 already_populated:
 *                   type: boolean
 *                   example: false
 *       405:
 *         description: Method not allowed (only POST is supported)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error while populating database
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Database population failed
 *                 error:
 *                   type: string
 *                   example: Error message from database or external API
 */


async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PopulateResponse>
) {
  console.log('🏥 FULL CONDITIONS DATABASE POPULATION FROM MERLIN API');

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    // Initialize schema first
    await conditionsDatabase.initializeSchema();

    // Force full population from Merlin API
    console.log('🚀 Starting full conditions population from Merlin API...');
    const result = await conditionsDatabase.populateFromMerlin();

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: `Successfully populated conditions database with ${result.count} conditions from Merlin API`,
        conditions_count: result.count,
        already_populated: result.count === 0
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to populate conditions database from Merlin API',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Full conditions population error:', error);
    return res.status(500).json({
      success: false,
      message: 'Database population failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}