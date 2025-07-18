import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { createPersonalAgent } from '../../lib/personal-ai-agent'

/**
 * @openapi
 * /api/personal/agent:
 *   post:
 *     summary: Process a message with a personal AI agent.
 *     description: Takes a user's message and session token, validates the session, and returns a response from a user-specific AI agent.
 *     tags:
 *       - Agent
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - sessionToken
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's input message.
 *               sessionToken:
 *                 type: string
 *                 description: Auth token for validating user session.
 *               conversationHistory:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional prior messages in the conversation.
 *     responses:
 *       200:
 *         description: Successful agent response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 response:
 *                   type: string
 *                 context:
 *                   type: object
 *                   properties:
 *                     memories_referenced:
 *                       type: integer
 *                     context_tags:
 *                       type: array
 *                       items:
 *                         type: string
 *                     agent_summary:
 *                       type: string
 *       400:
 *         description: Missing message or session token.
 *       401:
 *         description: Invalid session or user not found.
 *       405:
 *         description: Method not allowed.
 *       500:
 *         description: Internal server error.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { message, conversationHistory = [], sessionToken } = req.body

    if (!message || !sessionToken) {
      return res.status(400).json({ error: 'Message and session token are required' })
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

    // Create and use personal AI agent
    const agent = await createPersonalAgent(userId)
    const result = await agent.processMessage(message, conversationHistory)

    res.status(200).json({
      success: true,
      response: result.response,
      context: {
        memories_referenced: result.memories.length,
        context_tags: result.contextTags,
        agent_summary: agent.getAgentSummary()
      }
    })

  } catch (error) {
    console.error('Personal agent chat error:', error)
    res.status(500).json({ error: 'Failed to process message with personal agent' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}