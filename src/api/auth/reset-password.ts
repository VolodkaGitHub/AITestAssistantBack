import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import bcrypt from 'bcryptjs'

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset the user's password using a valid reset token.
 *     description: Verifies reset token, validates password security rules, checks for password reuse, and securely updates the user's password.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password reset token from email.
 *               password:
 *                 type: string
 *                 description: New password that meets minimum security requirements.
 *     responses:
 *       200:
 *         description: Password reset successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request, expired token, weak password, or password reused.
 *       405:
 *         description: Method not allowed. Only POST is supported.
 *       500:
 *         description: Internal server error during reset process.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    return await handleResetPassword(req, res)
  } catch (error) {
    console.error('Reset password API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function handleResetPassword(req: NextApiRequest, res: NextApiResponse) {
  const { token, password } = req.body

  if (!token || !password) {
    return res.status(400).json({ error: 'Reset token and new password are required' })
  }

  try {
    // Validate password requirements
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

    // Verify reset token and get user
    const resetData = await authDB.verifyPasswordResetToken(token)
    
    if (!resetData) {
      return res.status(400).json({ error: 'Invalid or expired reset token' })
    }

    // Get user by email to check password history
    const user = await authDB.getUserByEmail(resetData.email)
    
    if (!user) {
      return res.status(400).json({ error: 'User not found' })
    }

    // Check if password was used recently (before hashing)
    const isRecentlyUsed = await authDB.isPasswordRecentlyUsed(user.id, password)
    
    if (isRecentlyUsed) {
      return res.status(400).json({ 
        error: 'Password cannot be reused. Please choose a different password that you have not used in your last 5 passwords.' 
      })
    }

    // Hash the new password
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Update user password
    const success = await authDB.resetUserPassword(resetData.email, passwordHash, token)
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to reset password' })
    }

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return res.status(500).json({ error: 'Failed to reset password' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}