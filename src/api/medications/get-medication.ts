/**
 * Get Medication Details by ID
 * Retrieves complete medication information from static database
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { validateSessionToken } from '../../lib/auth-database';
import { medicationsDatabase, MedicationEntry } from '../../lib/medications-database';

interface GetMedicationResponse {
  success: boolean;
  medication?: MedicationEntry;
  error?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetMedicationResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Validate session
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization token'
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await validateSessionToken(sessionToken);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session token'
      });
    }

    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Medication ID is required'
      });
    }

    // Get medication from static database
    const medication = await medicationsDatabase.getMedicationById(id);

    if (!medication) {
      return res.status(404).json({
        success: false,
        error: 'Medication not found'
      });
    }

    return res.status(200).json({
      success: true,
      medication
    });

  } catch (error) {
    console.error('Get medication error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}