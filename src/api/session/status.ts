import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'

interface SessionStatusRequest {
  sessionToken: string
  merlinSessionId?: string
}

/**
 * @openapi
 * /api/session/status:
 *   post:
 *     summary: Check user authentication and Merlin session status
 *     description: Validates user session token and returns user info along with diagnostic session status.
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
 *                 description: User session token for authentication validation.
 *               merlinSessionId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional Merlin diagnostic session ID.
 *     responses:
 *       200:
 *         description: Session status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 userAuthenticated:
 *                   type: boolean
 *                   example: true
 *                 userSession:
 *                   type: object
 *                   properties:
 *                     sessionToken:
 *                       type: string
 *                       example: abc123sessiontoken
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: user123
 *                         firstName:
 *                           type: string
 *                           example: Sofia
 *                         lastName:
 *                           type: string
 *                           example: Kardash
 *                         email:
 *                           type: string
 *                           format: email
 *                           example: sofia@example.com
 *                         dateOfBirth:
 *                           type: string
 *                           format: date
 *                           example: 1990-05-21
 *                         genderAtBirth:
 *                           type: string
 *                           example: female
 *                         isVerified:
 *                           type: boolean
 *                           example: true
 *                 merlinSessionActive:
 *                   type: boolean
 *                   example: true
 *                 merlinSessionId:
 *                   type: string
 *                   nullable: true
 *                   example: session_abc123
 *                 message:
 *                   type: string
 *                   example: User authenticated with active diagnostic session
 *       400:
 *         description: Missing session token in request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Session token is required
 *       401:
 *         description: User session expired or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: User session expired
 *                 userAuthenticated:
 *                   type: boolean
 *                   example: false
 *                 merlinSessionActive:
 *                   type: boolean
 *                   example: false
 *       405:
 *         description: Method not allowed - only POST supported
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
    const { sessionToken, merlinSessionId }: SessionStatusRequest = req.body

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required' })
    }

    // Validate user authentication session
    const sessionResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken })
    })

    if (!sessionResponse.ok) {
      return res.status(401).json({ 
        error: 'User session expired',
        userAuthenticated: false,
        merlinSessionActive: false
      })
    }

    const sessionData = await sessionResponse.json()

    // Determine Merlin session status
    const merlinSessionActive = !!merlinSessionId

    res.status(200).json({
      success: true,
      userAuthenticated: true,
      userSession: {
        sessionToken,
        user: {
          id: sessionData.user.id,
          firstName: sessionData.user.firstName,
          lastName: sessionData.user.lastName,
          email: sessionData.user.email,
          dateOfBirth: sessionData.user.dateOfBirth,
          genderAtBirth: sessionData.user.genderAtBirth,
          isVerified: sessionData.user.isVerified
        }
      },
      merlinSessionActive,
      merlinSessionId: merlinSessionId || null,
      message: merlinSessionActive 
        ? 'User authenticated with active diagnostic session' 
        : 'User authenticated, no active diagnostic session'
    })

  } catch (error) {
    console.error('Session status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}