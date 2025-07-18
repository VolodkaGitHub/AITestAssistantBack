/**
 * Human API Connect Token API
 * Creates a connect token for user authentication with Human API
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { humanApiClient } from '../../lib/human-api-client';

interface ConnectTokenResponse {
  success: boolean;
  connect_token?: string;
  connect_url?: string;
  error?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ConnectTokenResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'Session token is required'
      });
    }

    // Human API temporarily disabled
    return res.status(503).json({
      success: false,
      error: 'Human API integration temporarily disabled'
    });

  } catch (error) {
    console.error('Error creating Human API connect token:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}