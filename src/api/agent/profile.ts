import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { userAgentProfileManager } from '../../lib/user-agent-profile'

/**
 * @openapi
 * /api/agent/profile:
 *   get:
 *     summary: Fetch the comprehensive agent profile for a user.
 *     description: Validates the session token and returns the full AI agent profile associated with the user.
 *     tags:
 *       - Agent
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionToken
 *             properties:
 *               sessionToken:
 *                 type: string
 *                 description: Auth token for validating user session.
 *     responses:
 *       200:
 *         description: Agent profile retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 profile:
 *                   type: object
 *       400:
 *         description: Session token missing.
 *       401:
 *         description: Invalid session or user not found.
 *       500:
 *         description: Internal server error.
 * 
 *   post:
 *     tags:
 *       - Agent
 *     summary: Create or update the agent's personality profile.
 *     description: Accepts new personality data and session token, validates the user, and updates the agent’s profile.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionToken
 *             properties:
 *               sessionToken:
 *                 type: string
 *                 description: Auth token for validating user session.
 *               personality:
 *                 type: string
 *                 description: Optional agent personality data to store or update.
 *     responses:
 *       200:
 *         description: Agent profile updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing session token or invalid input.
 *       401:
 *         description: Invalid session or user not found.
 *       500:
 *         description: Internal server error.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { sessionToken } = req.body

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required' })
    }

    // Validate session and get user ID
    const sessionResponse = await fetch(`${process.env.BASE_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken })
    })

    if (!sessionResponse.ok) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const userData = await sessionResponse.json()
    const userId = userData.user?.id

    if (!userId) {
      return res.status(401).json({ error: 'User not found' })
    }

    switch (req.method) {
      case 'GET':
        const profile = await userAgentProfileManager.getComprehensiveAgentProfile(userId)
        res.status(200).json({ success: true, profile })
        break

      case 'POST':
        const { personality } = req.body
        if (personality) {
          await userAgentProfileManager.createOrUpdateAgentPersonality(userId, personality)
        }
        res.status(200).json({ success: true, message: 'Profile updated' })
        break

      default:
        res.status(405).json({ error: 'Method not allowed' })
    }

  } catch (error) {
    console.error('Agent profile error:', error)
    res.status(500).json({ error: 'Failed to manage agent profile' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}