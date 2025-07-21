/**
 * Full Medications Database Population from Merlin API
 * One-time complete population of all medications
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { medicationsDatabase } from '../../lib/medications-database';

interface PopulateResponse {
  success: boolean;
  message: string;
  medications_count?: number;
  already_populated?: boolean;
  error?: string;
}

/**
 * @openapi
 * /api/medications/populate-full-database:
 *   post:
 *     summary: Full medications database population from Merlin API
 *     description: >
 *       One-time complete population of the medications database by fetching data from the Merlin API.
 *       Initializes schema if needed and imports all medication entries.
 *     tags:
 *       - Medications
 *     responses:
 *       200:
 *         description: Successful population of medications database
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
 *                   example: Successfully populated medications database with 500 medications from Merlin API
 *                 medications_count:
 *                   type: integer
 *                   example: 500
 *                 already_populated:
 *                   type: boolean
 *                   example: false
 *       405:
 *         description: Method not allowed
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
 *         description: Failed to populate medications database
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
 *                   example: Internal server error message
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PopulateResponse>
) {
  console.log('🏥 FULL MEDICATIONS DATABASE POPULATION FROM MERLIN API');

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    // Initialize schema first
    await medicationsDatabase.initializeSchema();

    // Force full population from Merlin API
    console.log('🚀 Starting full medications population from Merlin API...');
    const result = await medicationsDatabase.populateFromMerlin();

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: `Successfully populated medications database with ${result.count} medications from Merlin API`,
        medications_count: result.count,
        already_populated: result.count === 0
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to populate medications database from Merlin API',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Full medications population error:', error);
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