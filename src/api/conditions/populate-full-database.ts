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