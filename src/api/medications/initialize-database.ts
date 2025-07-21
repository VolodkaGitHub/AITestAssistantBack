/**
 * Initialize Medications Database
 * One-time population from Merlin API
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { medicationsDatabase } from '../../lib/medications-database';

interface InitializeResponse {
  success: boolean;
  message: string;
  medications_count?: number;
  already_populated?: boolean;
  error?: string;
}

/**
 * @openapi
 * /api/medications/initialize-database:
 *   post:
 *     summary: Initialize medications database
 *     description: One-time initialization and population of the medications database using Merlin API or predefined medications.
 *     tags:
 *       - Medications
 *     responses:
 *       200:
 *         description: Initialization successful or already populated
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
 *                   example: "Successfully populated medications database with 200 medications"
 *                 medications_count:
 *                   type: integer
 *                   example: 200
 *                 already_populated:
 *                   type: boolean
 *                   example: false
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
 *                 message:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Internal server error during initialization
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
 *                   example: "Database initialization failed"
 *                 error:
 *                   type: string
 *                   example: "Unable to connect to Merlin API"
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<InitializeResponse>
) {
  console.log('🏥 INITIALIZING MEDICATIONS DATABASE');

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    // Initialize schema first
    await medicationsDatabase.initializeSchema();

    // Check if already populated
    const needsPopulation = await medicationsDatabase.needsPopulation();
    
    if (!needsPopulation) {
      const count = await medicationsDatabase.getMedicationsCount();
      return res.status(200).json({
        success: true,
        message: `Medications database already populated with ${count} medications`,
        medications_count: count,
        already_populated: true
      });
    }

    // Populate from Merlin (or common medications for now)
    const result = await medicationsDatabase.populateFromMerlin();

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: `Successfully populated medications database with ${result.count} medications`,
        medications_count: result.count,
        already_populated: false
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to populate medications database',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Initialize medications database error:', error);
    return res.status(500).json({
      success: false,
      message: 'Database initialization failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}