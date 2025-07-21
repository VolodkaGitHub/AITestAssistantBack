import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { terraClient } from '../../lib/terra-client'
import { validateSessionToken } from '../../lib/auth-database'

/**
 * @openapi
 * /api/wearables/auth:
 *   post:
 *     tags:
 *       - Wearables
 *     summary: Generate authentication URL for wearable provider
 *     description: Returns an OAuth authentication URL for the specified wearable provider after validating the user session.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *             properties:
 *               provider:
 *                 type: string
 *                 example: "fitbit"
 *                 description: Name of the wearable provider to authenticate with.
 *     responses:
 *       200:
 *         description: Authentication URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auth_url:
 *                   type: string
 *                   example: "https://wearableprovider.com/oauth/authorize?..."
 *                 provider:
 *                   type: string
 *                   example: "fitbit"
 *       400:
 *         description: Missing or invalid provider parameter, or failed to generate auth URL
 *       401:
 *         description: Missing or invalid session token
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error during authentication
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Authentication failed
 *                 details:
 *                   type: string
 *                   example: "Invalid provider"  
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate session
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization token' })
    }

    const sessionToken = authHeader.substring(7)
    const user = await validateSessionToken(sessionToken)
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const { provider } = req.body
    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' })
    }

    // Generate auth URL for the provider  
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://treatmentglm.replit.app';
    const redirectUri = `${baseUrl}/api/wearables/callback`;
    const authResult = await terraClient.generateAuthURL(provider, redirectUri, user.id)
    
    if (!authResult || !authResult.auth_url) {
      return res.status(400).json({ error: 'Invalid provider or failed to generate auth URL' })
    }

    // Return authentication URL for frontend redirect
    return res.status(200).json({ 
      auth_url: authResult.auth_url,
      provider: provider
    })

  } catch (error) {
    console.error('Error in wearables auth handler:', error)
    return res.status(500).json({ 
      error: 'Authentication failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}