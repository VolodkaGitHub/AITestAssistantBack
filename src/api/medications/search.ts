/**
 * Search Medications from Static Database
 * Fast searching without external API calls
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { authDB } from '../../lib/auth-database';
import { medicationsDatabase, MedicationEntry } from '../../lib/medications-database';

interface SearchResponse {
  success: boolean;
  medications?: MedicationEntry[];
  total_count?: number;
  query?: string;
  error?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse>
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
    const user = await authDB.validateSession(sessionToken);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session token'
      });
    }

    const { q: query, limit, class: therapeuticClass } = req.query;

    if (!query && !therapeuticClass) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" or "class" is required'
      });
    }

    // Ensure medications database schema exists (but don't auto-populate)
    await medicationsDatabase.initializeSchema();

    let medications: MedicationEntry[] = [];
    const searchLimit = limit ? parseInt(limit as string) : 50;

    if (therapeuticClass) {
      // Search by therapeutic class
      medications = await medicationsDatabase.getMedicationsByClass(therapeuticClass as string, searchLimit);
    } else {
      // Search by name/generic name
      medications = await medicationsDatabase.searchMedications(query as string, searchLimit);
    }

    console.log(`🔍 Medication search: "${query || therapeuticClass}" returned ${medications.length} results`);

    return res.status(200).json({
      success: true,
      medications,
      total_count: medications.length,
      query: (query || therapeuticClass) as string
    });

  } catch (error) {
    console.error('Medication search error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}