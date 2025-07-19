import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { chatMemoryExtractor } from '../../lib/chat-memory-extractor'

/**
 * @openapi
 * /api/extract-memory:
 *   post:
 *     summary: Extract memory and context from user chat history
 *     description: |
 *       Accepts a session token, session ID, and chat messages.
 *       Validates the session, extracts memories from chat history,
 *       and returns updated user context and contextual summary.
 *     tags:
 *       - Chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionToken
 *               - sessionId
 *               - messages
 *             properties:
 *               sessionToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               sessionId:
 *                 type: string
 *                 example: "session_12345"
 *               messages:
 *                 type: array
 *                 description: Array of chat messages to process
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       example: "user"
 *                     content:
 *                       type: string
 *                       example: "Hello, how can I get help?"
 *     responses:
 *       200:
 *         description: Successful extraction of memories and context
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 extractedMemories:
 *                   type: array
 *                   description: Extracted memory items from chat history
 *                   items:
 *                     type: object
 *                 context:
 *                   type: object
 *                   description: Updated user chat context
 *                 contextualSummary:
 *                   type: string
 *                   description: Generated contextual summary of chat
 *                 memoryCount:
 *                   type: integer
 *                   description: Number of extracted memories
 *                   example: 3
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing required fields"
 *       401:
 *         description: Unauthorized - invalid session token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid session"
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to extract memory"
 *                 details:
 *                   type: string
 *                   example: "Error message details"
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { sessionToken, sessionId, messages } = req.body

    if (!sessionToken || !sessionId || !messages) {
      return res.status(400).json({ error: 'Missing required fields' })
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

    // Extract memory from chat history
    const extractedMemories = await chatMemoryExtractor.extractFromChatHistory(
      user.id,
      sessionId,
      messages
    )

    // Get updated context
    const context = await chatMemoryExtractor.getUserChatContext(user.id)
    const contextualSummary = await chatMemoryExtractor.generateContextualSummary(user.id)

    return res.status(200).json({
      success: true,
      extractedMemories,
      context,
      contextualSummary,
      memoryCount: extractedMemories.length
    })

  } catch (error) {
    console.error('❌ Error in extract-memory API:', error)
    return res.status(500).json({ 
      error: 'Failed to extract memory',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}