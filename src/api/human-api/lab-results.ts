/**
 * Human API Lab Results API
 * Fetches lab results for authenticated users
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { humanApiClient } from '../../lib/human-api-client';

interface LabResultsResponse {
  success: boolean;
  lab_results?: any[];
  user_profile?: any;
  connected_sources?: any[];
  error?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LabResultsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { access_token } = req.query;

    if (!access_token || typeof access_token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Access token is required'
      });
    }

    // Human API temporarily disabled
    return res.status(503).json({
      success: false,
      error: 'Human API lab results temporarily disabled'
    });

  } catch (error) {
    console.error('Error fetching Human API lab results:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch lab results'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}