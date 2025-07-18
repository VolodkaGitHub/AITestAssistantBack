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