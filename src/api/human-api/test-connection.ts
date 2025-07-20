/**
 * Test Human API Connection API
 * Tests the Human API client connection and returns connection status
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { humanApiClient } from '../../lib/human-api-client';

interface TestConnectionResponse {
  success: boolean;
  connection_status: boolean;
  message: string;
  environment: string;
  client_configured: boolean;
}

/**
 * @openapi
 * /api/human-api/test-connection:
 *   get:
 *     summary: Test Human API client connection
 *     description: Tests whether the Human API client is properly configured and available.
 *     tags:
 *       - HumanAPI
 *     responses:
 *       200:
 *         description: Human API credentials are missing or misconfigured
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 connection_status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Human API credentials not configured.
 *                 environment:
 *                   type: string
 *                   example: development
 *                 client_configured:
 *                   type: boolean
 *                   example: false
 *       503:
 *         description: Human API temporarily disabled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 connection_status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Human API temporarily disabled
 *                 environment:
 *                   type: string
 *                   example: development
 *                 client_configured:
 *                   type: boolean
 *                   example: false
 *       500:
 *         description: Internal server error while testing connection
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 connection_status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal server error while testing connection
 *                 environment:
 *                   type: string
 *                   example: development
 *                 client_configured:
 *                   type: boolean
 *                   example: false
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
 *                 connection_status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Method not allowed
 *                 environment:
 *                   type: string
 *                   example: unknown
 *                 client_configured:
 *                   type: boolean
 *                   example: false
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TestConnectionResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      connection_status: false,
      message: 'Method not allowed',
      environment: 'unknown',
      client_configured: false
    });
  }

  try {
    // Check if environment variables are configured
    const clientConfigured = !!(process.env.HUMAN_API_CLIENT_ID && process.env.HUMAN_API_CLIENT_SECRET);
    
    if (!clientConfigured) {
      return res.status(200).json({
        success: false,
        connection_status: false,
        message: 'Human API credentials not configured. Please set HUMAN_API_CLIENT_ID and HUMAN_API_CLIENT_SECRET environment variables.',
        environment: process.env.NODE_ENV || 'development',
        client_configured: false
      });
    }

    // Human API temporarily disabled
    return res.status(503).json({
      success: false,
      connection_status: false,
      message: 'Human API temporarily disabled',
      environment: process.env.NODE_ENV || 'development',
      client_configured: false
    });

  } catch (error) {
    console.error('Error testing Human API connection:', error);
    
    return res.status(500).json({
      success: false,
      connection_status: false,
      message: 'Internal server error while testing connection',
      environment: process.env.NODE_ENV || 'development',
      client_configured: false
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}