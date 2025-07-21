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

/**
 * @openapi
 * /api/medications/search:
 *   get:
 *     summary: Search medications from static database
 *     description: Search medications by name or therapeutic class without external API calls.
 *     tags:
 *       - Medications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query string for medication name or generic name
 *       - in: query
 *         name: class
 *         schema:
 *           type: string
 *         description: Therapeutic class to filter medications
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: Successful search result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 medications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "med123"
 *                       name:
 *                         type: string
 *                         example: "Aspirin"
 *                       generic_name:
 *                         type: string
 *                         example: "Acetylsalicylic Acid"
 *                       therapeutic_class:
 *                         type: string
 *                         example: "Analgesic"
 *                 total_count:
 *                   type: integer
 *                   example: 20
 *                 query:
 *                   type: string
 *                   example: "aspirin"
 *       400:
 *         description: Missing required query parameters
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
 *                   example: 'Query parameter "q" or "class" is required'
 *       401:
 *         description: Unauthorized - invalid or missing token
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
 *                   example: 'Invalid session token'
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
 *                 error:
 *                   type: string
 *                   example: 'Method not allowed'
 *       500:
 *         description: Internal server error
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
 *                   example: 'Unknown error'
 */

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