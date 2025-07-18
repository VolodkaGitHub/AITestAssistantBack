import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    return await handleGetUserSessions(req, res)
  } catch (error) {
    console.error('Sessions API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// GET /api/profile/sessions - Get user sessions
async function handleGetUserSessions(req: NextApiRequest, res: NextApiResponse) {
  const { sessionToken } = req.query

  if (!sessionToken || typeof sessionToken !== 'string') {
    return res.status(401).json({ error: 'Session token required' })
  }

  try {
    // Validate session
    const sessionData = await authDB.validateSession(sessionToken)
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    // Get user sessions
    const sessions = await authDB.getUserSessions(sessionData.id)

    // Format sessions for client
    const formattedSessions = sessions.map(session => ({
      id: session.id,
      isActive: session.is_active,
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      createdAt: session.created_at,
      lastAccessed: session.last_accessed,
      expiresAt: session.expires_at,
      isCurrent: session.session_token === sessionToken
    }))

    return res.status(200).json({
      success: true,
      sessions: formattedSessions,
      totalSessions: formattedSessions.length,
      activeSessions: formattedSessions.filter(s => s.isActive).length
    })
  } catch (error) {
    console.error('Get sessions error:', error)
    return res.status(500).json({ error: 'Failed to retrieve sessions' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}