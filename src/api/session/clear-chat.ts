import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'

interface ClearChatRequest {
  sessionToken: string
}

/**
 * @openapi
 * /api/session/clear-chat:
 *   post:
 *     summary: Clear diagnostic chat session
 *     description: Clears diagnostic chat session data (messages, questions, etc.) but keeps user authentication active.
 *     tags:
 *       - Session
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
 *                 description: User session token to validate the authenticated session.
 *     responses:
 *       200:
 *         description: Chat cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chat cleared successfully
 *                 userSession:
 *                   type: object
 *                   properties:
 *                     sessionToken:
 *                       type: string
 *                       example: abc123sessiontoken
 *                     user:
 *                       type: object
 *                       description: Authenticated user data returned from session validation
 *                     remainsAuthenticated:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Missing required sessionToken in request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Session token is required
 *       401:
 *         description: Unauthorized - invalid session token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid session token
 *       405:
 *         description: Method not allowed, only POST supported
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { sessionToken }: ClearChatRequest = req.body

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required' })
    }

    // Validate user session (keep user authenticated)
    const sessionResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken })
    })

    if (!sessionResponse.ok) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const sessionData = await sessionResponse.json()

    // Clear chat clears only the diagnostic session, not the user authentication
    // The frontend should clear:
    // - Current Merlin session ID
    // - Differential diagnosis data
    // - Chat messages
    // - Diagnostic questions
    // But KEEP the user session token and user data

    res.status(200).json({
      success: true,
      message: 'Chat cleared successfully',
      userSession: {
        sessionToken,
        user: sessionData.user,
        remainsAuthenticated: true
      }
    })

  } catch (error) {
    console.error('Clear chat error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}