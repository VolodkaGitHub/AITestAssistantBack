import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'

interface SessionStatusRequest {
  sessionToken: string
  merlinSessionId?: string
}

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