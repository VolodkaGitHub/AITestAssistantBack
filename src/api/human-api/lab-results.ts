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

/**
 * @openapi
 * /api/human-api/lab-results:
 *   get:
 *     summary: Get lab results for authenticated user
 *     description: Returns lab results, user profile, and connected sources for a user authenticated via Human API. **Currently disabled.**
 *     tags:
 *       - HumanAPI
 *     parameters:
 *       - in: query
 *         name: access_token
 *         required: true
 *         schema:
 *           type: string
 *         description: Access token from Human API for the authenticated user
 *     responses:
 *       200:
 *         description: Lab results successfully fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 lab_results:
 *                   type: array
 *                   items:
 *                     type: object
 *                 user_profile:
 *                   type: object
 *                 connected_sources:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Access token is missing or invalid
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
 *         description: Internal server error while fetching lab results
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