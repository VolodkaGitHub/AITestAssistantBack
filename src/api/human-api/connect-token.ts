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

/**
 * @openapi
 * /api/human-api/connect-token:
 *   post:
 *     tags:
 *       - HumanAPI
 *     summary: Create Human API connect token
 *     description: Creates a connect token to authenticate the user with Human API. (Currently disabled)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionToken:
 *                 type: string
 *                 description: The session token of the authenticated user
 *             required:
 *               - sessionToken
 *     responses:
 *       200:
 *         description: Successfully created connect token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 connect_token:
 *                   type: string
 *                 connect_url:
 *                   type: string
 *       400:
 *         description: Missing session token in request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       503:
 *         description: Human API integration temporarily disabled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 */

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