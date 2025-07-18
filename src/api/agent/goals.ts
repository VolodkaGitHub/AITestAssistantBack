import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { userAgentProfileManager } from '../../lib/user-agent-profile'

/**
 * @openapi
 * /api/agent/goals:
 *   get:
 *     summary: Retrieve user goals for a personal AI agent.
 *     description: Returns the goal list associated with the user's agent, given a valid session token.
 *     tags:
 *       - Agent
 *     parameters:
 *       - in: query
 *         name: sessionToken
 *         required: true
 *         schema:
 *           type: string
 *         description: Session token used for validation.
 *     responses:
 *       200:
 *         description: List of user goals.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 goals:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Missing session token.
 *       401:
 *         description: Invalid session or user not found.
 *       500:
 *         description: Internal server error.
 * 
 *   post:
 *     tags:
 *       - Agent
 *     summary: Create a new goal for a personal AI agent.
 *     description: Accepts goal data and session token, validates the session, and stores the goal.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionToken
 *               - goal
 *             properties:
 *               sessionToken:
 *                 type: string
 *                 description: Session token used for validation.
 *               goal:
 *                 type: string
 *                 description: The goal description to be saved.
 *     responses:
 *       201:
 *         description: Goal created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 goal:
 *                   type: string
 *       400:
 *         description: Missing session token or goal data.
 *       401:
 *         description: Invalid session or user not found.
 *       500:
 *         description: Internal server error.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { sessionToken } = req.body || req.query

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required' })
    }

    // Validate session and get user ID
    const sessionResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
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
        const goals = await userAgentProfileManager.getUserGoals(userId)
        res.status(200).json({ success: true, goals })
        break

      case 'POST':
        const { goal } = req.body
        if (!goal) {
          return res.status(400).json({ error: 'Goal data is required' })
        }
        
        const newGoal = await userAgentProfileManager.createUserGoal(userId, goal)
        res.status(201).json({ success: true, goal: newGoal })
        break

      default:
        res.status(405).json({ error: 'Method not allowed' })
    }

  } catch (error) {
    console.error('Agent goals error:', error)
    res.status(500).json({ error: 'Failed to manage agent goals' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}