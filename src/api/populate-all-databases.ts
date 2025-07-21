/**
 * One-Time Full Population of All Databases
 * Populates medications and conditions from actual Merlin API endpoints
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { medicationsDatabase } from '../lib/medications-database';
import { conditionsDatabase } from '../lib/conditions-database';

interface PopulateAllResponse {
  success: boolean;
  message: string;
  medications_count?: number;
  conditions_count?: number;
  errors?: string[];
  ready_for_merlin?: boolean;
}

/**
 * @openapi
 * /api/webhooks/populate-all-databases:
 *   post:
 *     summary: One-time full population of medications and conditions databases
 *     description: Populates medications and conditions from Merlin API endpoints.
 *     tags:
 *       - Webhooks
 *     responses:
 *       200:
 *         description: Successful full population without errors
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
 *                   example: Successfully populated databases: 100 medications, 50 conditions
 *                 medications_count:
 *                   type: integer
 *                   example: 100
 *                 conditions_count:
 *                   type: integer
 *                   example: 50
 *                 ready_for_merlin:
 *                   type: boolean
 *                   example: true
 *       207:
 *         description: Partial success with some errors
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
 *                   example: Partial success: 80 medications, 40 conditions. Some errors occurred.
 *                 medications_count:
 *                   type: integer
 *                   example: 80
 *                 conditions_count:
 *                   type: integer
 *                   example: 40
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                 ready_for_merlin:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Missing UMA API credentials
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
 *                   example: UMA API credentials not configured. Please set UMA_API_KEY environment variable.
 *                 ready_for_merlin:
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
 *                   example: Method not allowed
 *       500:
 *         description: Failed to populate databases or internal error
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
 *                   example: Failed to populate databases
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                 ready_for_merlin:
 *                   type: boolean
 *                   example: true
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PopulateAllResponse>
) {
  console.log('🚀 ONE-TIME FULL DATABASE POPULATION');

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    const errors: string[] = [];
    let medicationsCount = 0;
    let conditionsCount = 0;

    console.log('📋 Initializing database schemas...');
    
    // Initialize both schemas
    await medicationsDatabase.initializeSchema();
    await conditionsDatabase.initializeSchema();

    // Check if we have UMA API credentials for JWT authentication
    const umaApiKey = process.env.UMA_API_KEY;
    
    if (!umaApiKey) {
      return res.status(400).json({
        success: false,
        message: 'UMA API credentials not configured. Please set UMA_API_KEY environment variable.',
        ready_for_merlin: false
      });
    }

    console.log('🏥 Starting medications population from Merlin API...');
    
    // Populate medications
    try {
      const medicationsResult = await medicationsDatabase.populateFromMerlin();
      if (medicationsResult.success) {
        medicationsCount = medicationsResult.count;
        console.log(`✅ Medications: ${medicationsCount} populated`);
      } else {
        errors.push(`Medications: ${medicationsResult.error}`);
      }
    } catch (error) {
      const errorMsg = `Medications population failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }

    console.log('🏥 Starting conditions population from Merlin API...');
    
    // Populate conditions
    try {
      const conditionsResult = await conditionsDatabase.populateFromMerlin();
      if (conditionsResult.success) {
        conditionsCount = conditionsResult.count;
        console.log(`✅ Conditions: ${conditionsCount} populated`);
      } else {
        errors.push(`Conditions: ${conditionsResult.error}`);
      }
    } catch (error) {
      const errorMsg = `Conditions population failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error(errorMsg);
    }

    // Determine success
    const hasData = medicationsCount > 0 || conditionsCount > 0;
    const hasErrors = errors.length > 0;

    if (hasData && !hasErrors) {
      return res.status(200).json({
        success: true,
        message: `Successfully populated databases: ${medicationsCount} medications, ${conditionsCount} conditions`,
        medications_count: medicationsCount,
        conditions_count: conditionsCount,
        ready_for_merlin: true
      });
    } else if (hasData && hasErrors) {
      return res.status(207).json({
        success: true,
        message: `Partial success: ${medicationsCount} medications, ${conditionsCount} conditions. Some errors occurred.`,
        medications_count: medicationsCount,
        conditions_count: conditionsCount,
        errors,
        ready_for_merlin: true
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to populate databases',
        medications_count: medicationsCount,
        conditions_count: conditionsCount,
        errors,
        ready_for_merlin: true
      });
    }

  } catch (error) {
    console.error('Full database population error:', error);
    return res.status(500).json({
      success: false,
      message: 'Database population failed',
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      ready_for_merlin: false
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}