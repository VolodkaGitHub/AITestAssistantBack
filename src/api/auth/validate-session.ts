import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    
    const { sessionToken } = req.body

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required' })
    }

    // Extract token string from session object if needed
    const tokenString = typeof sessionToken === 'string' 
      ? sessionToken 
      : sessionToken.session_token || sessionToken.id

    if (!tokenString) {
      return res.status(400).json({ error: 'Invalid session token format' })
    }

    // Validate session
    console.log(`🔍 Validating session token: ${tokenString.substring(0, 20)}...`)
    const sessionData = await authDB.validateSession(tokenString)

    if (!sessionData) {
      console.log(`❌ Session validation failed for token: ${tokenString.substring(0, 20)}...`)
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    console.log(`✅ Session validation successful for user: ${sessionData.email}`)

    // Return user data
    res.status(200).json({
      success: true,
      user: {
        id: sessionData.id,
        email: sessionData.email,
        phone: sessionData.phone,
        firstName: sessionData.first_name,
        lastName: sessionData.last_name,
        dateOfBirth: sessionData.date_of_birth,
        genderAtBirth: sessionData.gender_at_birth,
        isVerified: sessionData.is_verified
      },
      sessionToken: tokenString
    })

  } catch (error) {
    console.error('Session validation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}