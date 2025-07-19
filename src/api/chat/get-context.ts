import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { chatMemoryExtractor } from '../../lib/chat-memory-extractor'

/**
 * @openapi
 * /api/chat/context:
 *   get:
 *     summary: Retrieve user's chat context and contextual summary
 *     description: |
 *       Validates the user's session token and fetches their chat context and a generated contextual summary.
 *       Returns whether any chat memory exists.
 *     tags:
 *       - Chat
 *     parameters:
 *       - in: query
 *         name: sessionToken
 *         required: true
 *         schema:
 *           type: string
 *         description: Session token for user authentication
 *         example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Successfully retrieved chat context and summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 context:
 *                   type: string
 *                   description: User's chat context data
 *                   example: "Previous chat messages and extracted memories..."
 *                 contextualSummary:
 *                   type: string
 *                   description: Summary of the user's chat context
 *                   example: "Summary of key points from previous conversations."
 *                 hasMemory:
 *                   type: boolean
 *                   description: Indicates if any chat memory was found
 *                   example: true
 *       400:
 *         description: Missing required session token parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Session token required"
 *       401:
 *         description: Invalid session token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid session"
 *       405:
 *         description: HTTP method not allowed (only GET supported)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Server error while retrieving context
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to get context"
 *                 details:
 *                   type: string
 *                   example: "Database connection error"
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { sessionToken } = req.query

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token required' })
    }

    // Validate session token and get user info
    const validateResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionToken })
    })

    if (!validateResponse.ok) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const { user } = await validateResponse.json()

    // Initialize schema if needed
    await chatMemoryExtractor.initializeSchema()

    // Get user's chat context
    const context = await chatMemoryExtractor.getUserChatContext(user.id)
    const contextualSummary = await chatMemoryExtractor.generateContextualSummary(user.id)

    return res.status(200).json({
      success: true,
      context,
      contextualSummary,
      hasMemory: contextualSummary.length > 0
    })

  } catch (error) {
    console.error('❌ Error in get-context API:', error)
    return res.status(500).json({ 
      error: 'Failed to get context',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}