import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    return await handleVerifyResetToken(req, res)
  } catch (error) {
    console.error('Verify reset token API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function handleVerifyResetToken(req: NextApiRequest, res: NextApiResponse) {
  // Support both GET (query params) and POST (body params) requests
  const token = req.method === 'GET' ? req.query.token : req.body.token

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Reset token is required' })
  }

  try {
    // Verify reset token
    const resetData = await authDB.verifyPasswordResetToken(token)
    
    if (!resetData) {
      return res.status(400).json({ 
        valid: false,
        error: 'Invalid or expired reset token' 
      })
    }

    return res.status(200).json({
      valid: true,
      email: resetData.email
    })
  } catch (error) {
    console.error('Verify reset token error:', error)
    return res.status(500).json({ error: 'Failed to verify reset token' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}