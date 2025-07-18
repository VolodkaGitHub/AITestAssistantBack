import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import { sendPasswordResetEmail } from '../../lib/email-service'

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     summary: Initiate password reset or setup for a user.
 *     description: Given an email address, this endpoint checks if the user exists and either sends a password reset email or a setup email (for legacy accounts without a password). Always returns success to avoid email enumeration.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address.
 *     responses:
 *       200:
 *         description: Password reset or setup email sent (or success returned silently).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 requiresSetup:
 *                   type: boolean
 *                   nullable: true
 *                   description: Indicates if the user needs to set a password.
 *       400:
 *         description: Email not provided in request.
 *       405:
 *         description: Method not allowed (only POST is accepted).
 *       500:
 *         description: Server error during password reset or setup process.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    return await handleForgotPassword(req, res)
  } catch (error) {
    console.error('Forgot password API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function handleForgotPassword(req: NextApiRequest, res: NextApiResponse) {
  const { email } = req.body

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  try {
    // Check if user exists
    const user = await authDB.getUserByEmail(email)
    
    // Always return success to prevent email enumeration
    // But only send email if user actually exists
    if (user) {
      // Check if user has a password set
      if (!(user as any).password_hash) {
        // User exists but no password - send them a password setup email
        const resetToken = await authDB.createPasswordResetToken(user.email)
        
        if (resetToken) {
          // Send password setup email with appropriate messaging
          await sendPasswordResetEmail(user.email, resetToken, `${user.first_name} ${user.last_name}`, true)
        }
        
        return res.status(200).json({
          success: true,
          message: 'Password setup instructions sent to your email',
          requiresSetup: true
        })
      }

      // Generate password reset token
      const resetToken = await authDB.createPasswordResetToken(user.email)
      
      if (resetToken) {
        // Send password reset email
        await sendPasswordResetEmail(user.email, resetToken, `${user.first_name} ${user.last_name}`)
      }
    }

    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, password reset instructions have been sent'
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return res.status(500).json({ error: 'Failed to process password reset request' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}