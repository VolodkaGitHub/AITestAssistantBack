import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import bcrypt from 'bcryptjs'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    return await handleSetupPassword(req, res)
  } catch (error) {
    console.error('Setup password API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function handleSetupPassword(req: NextApiRequest, res: NextApiResponse) {
  const { sessionToken, password } = req.body

  if (!sessionToken || !password) {
    return res.status(400).json({ error: 'Session token and password are required' })
  }

  try {
    // Validate session and get user data
    const sessionData = await authDB.validateSession(sessionToken)
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    // Check if user already has a password
    const user = await authDB.getUserById(sessionData.id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if ((user as any).password_hash) {
      return res.status(409).json({ error: 'User already has a password set' })
    }

    // Validate password strength (server-side validation)
    if (password.length < 12) {
      return res.status(400).json({ error: 'Password must be at least 12 characters long' })
    }

    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter' })
    }

    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one lowercase letter' })
    }

    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one number' })
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one special character' })
    }

    // Hash the password
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Update user with password hash
    const success = await authDB.setUserPassword(sessionData.id, passwordHash)
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to set password' })
    }

    return res.status(200).json({
      success: true,
      message: 'Password set successfully'
    })
  } catch (error) {
    console.error('Setup password error:', error)
    return res.status(500).json({ error: 'Failed to set password' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}