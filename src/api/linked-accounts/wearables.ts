import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { LinkedMentionService } from '../../lib/linked-mention-service'

/**
 * @openapi
 * /api/linked-accounts/wearables:
 *   get:
 *     summary: Fetch wearable data for a linked account
 *     description: Retrieves wearable device data for a linked user account. Requires valid session token.
 *     tags:
 *       - LinkedAccounts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: linkedAccountId
 *         in: query
 *         required: true
 *         description: ID of the linked account to fetch wearables data for
 *         schema:
 *           type: string
 *           example: "abc123"
 *     responses:
 *       200:
 *         description: Wearables data fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Wearables data object returned from the service
 *       400:
 *         description: Missing or invalid linkedAccountId parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Missing linkedAccountId parameter
 *       401:
 *         description: Missing or invalid session token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid session token
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error while fetching wearables data
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
 *                   example: Failed to fetch linked account wearables data
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '')
    if (!sessionToken) {
      return res.status(401).json({ error: 'No session token provided' })
    }

    const user = await validateSessionToken(sessionToken)
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const { linkedAccountId } = req.query
    if (!linkedAccountId || typeof linkedAccountId !== 'string') {
      return res.status(400).json({ error: 'Missing linkedAccountId parameter' })
    }

    const linkedMentionService = new LinkedMentionService(sessionToken)
    const wearablesData = await linkedMentionService.getLinkedAccountWearablesData(linkedAccountId)

    return res.status(200).json({
      success: true,
      data: wearablesData
    })

  } catch (error) {
    console.error('❌ Error fetching linked account wearables:', error)
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch linked account wearables data' 
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}