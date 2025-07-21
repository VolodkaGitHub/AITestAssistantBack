import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { terraClient } from '../../lib/terra-client'
import { WearablesDatabase } from '../../lib/wearables-database'
import { validateSessionToken } from '../../lib/auth-database'

/**
 * @openapi
 * /api/wearables/disconnect:
 *   delete:
 *     summary: Disconnect a wearable device from the user's account
 *     description: >
 *       Disconnects a wearable device for an authorized user,
 *       where provider is the service identifier, e.g., "GOOGLE", "OURA", etc.
 *     tags:
 *       - Wearables
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         description: Bearer token for user authorization
 *         required: true
 *         schema:
 *           type: string
 *           example: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       - in: query
 *         name: provider
 *         description: Wearable device provider to disconnect (required parameter)
 *         required: true
 *         schema:
 *           type: string
 *           example: OURA
 *     responses:
 *       200:
 *         description: Wearable device disconnected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Wearable device disconnected successfully
 *                 provider:
 *                   type: string
 *                   example: OURA
 *       400:
 *         description: Bad request parameters (missing provider)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Provider is required
 *       401:
 *         description: Authorization error (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Missing or invalid authorization token
 *       404:
 *         description: Wearable device not found for this user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Wearable connection not found
 *       405:
 *         description: Method not allowed (DELETE required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error while disconnecting the device
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to disconnect wearable device
 *                 details:
 *                   type: string
 *                   example: Database connection error
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
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

    const { provider } = req.query

    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'Provider is required' })
    }

    // Get the connection to find Terra user ID
    const connections = await WearablesDatabase.getUserConnections(user.id)
    const connection = connections.find(c => c.provider === provider)
    
    if (!connection) {
      return res.status(404).json({ error: 'Wearable connection not found' })
    }

    // Deauthenticate from Terra
    const terraDisconnected = connection.terra_user_id ? 
      await terraClient.disconnectUser(connection.terra_user_id) : true
    
    if (!terraDisconnected) {
      console.warn(`Failed to deauthenticate Terra user ${connection.terra_user_id}`)
    }

    // Disconnect in our database (soft delete)
    await WearablesDatabase.disconnectDevice(user.id, provider)

    return res.status(200).json({ 
      message: 'Wearable device disconnected successfully',
      provider: provider
    })

  } catch (error) {
    console.error('Error in wearables disconnect handler:', error)
    return res.status(500).json({ 
      error: 'Failed to disconnect wearable device',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}