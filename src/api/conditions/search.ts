/**
 * Conditions Search API
 * Search through static conditions database
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { conditionsDatabase } from '../../lib/conditions-database';

interface SearchResponse {
  conditions: any[];
  total: number;
  query: string;
}

interface ErrorResponse {
  error: string;
}

/**
 * @openapi
 * /api/conditions/search:
 *   get:
 *     summary: Search conditions
 *     description: Performs a search through the conditions database using a query string.
 *     tags:
 *       - Conditions
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         description: The search query string.
 *         schema:
 *           type: string
 *           example: diab
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Maximum number of results to return (default is 50).
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: Successfully returned search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conditions:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                   example: 3
 *                 query:
 *                   type: string
 *                   example: diab
 *       400:
 *         description: Missing or invalid query parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Query parameter "q" is required
 *       405:
 *         description: Method Not Allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Server error during search
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to search conditions
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { q: query, limit } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Query parameter "q" is required'
      });
    }

    // Ensure conditions database schema exists (but don't auto-populate)
    await conditionsDatabase.initializeSchema();

    const searchLimit = limit ? parseInt(limit as string) : 50;
    const conditions = await conditionsDatabase.searchConditions(query, searchLimit);

    console.log(`🔍 CONDITIONS SEARCH: "${query}" returned ${conditions.length} results`);

    return res.status(200).json({
      conditions,
      total: conditions.length,
      query
    });

  } catch (error) {
    console.error('Conditions search error:', error);
    return res.status(500).json({
      error: 'Failed to search conditions'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}