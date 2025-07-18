import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import { sendOTPEmail } from '../../lib/email-service'
import { DatabasePool } from '../../lib/database-pool'
import bcrypt from 'bcryptjs'

interface LoginWithPasswordRequest {
  email: string
  password: string
  preferredOtpMethod: 'email'
}

/**
 * @openapi
 * /api/auth/login-with-password:
 *   post:
 *     summary: Authenticate user with email and password, then send OTP for second factor.
 *     description: Validates user credentials, manages lockouts, and sends a verification code via email for 2FA. Logs every attempt securely.
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
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's registered email address.
 *               password:
 *                 type: string
 *                 description: User's password.
 *               preferredOtpMethod:
 *                 type: string
 *                 enum: [email]
 *                 description: OTP delivery method. Only 'email' is supported.
 *     responses:
 *       200:
 *         description: OTP sent successfully for login verification.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 otpSent:
 *                   type: boolean
 *                 method:
 *                   type: string
 *                   enum: [email]
 *       400:
 *         description: Missing or invalid email/password. Or password login not set.
 *       401:
 *         description: Invalid credentials.
 *       423:
 *         description: Account locked after multiple failed login attempts.
 *       405:
 *         description: Method not allowed (only POST supported).
 *       500:
 *         description: Server error during login or OTP dispatch.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Initialize database schema if needed
    await authDB.initializeSchema()
    
    const { email, password }: LoginWithPasswordRequest = req.body

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Get client IP and User-Agent for security logging
    const rawIp = req.headers['x-forwarded-for'] as string || req.connection.remoteAddress || ''
    const ipAddress = rawIp.split(',')[0].trim()
    const userAgent = req.headers['user-agent'] || ''

    // Find user by email
    const user = await authDB.findUserByEmail(email)
    
    if (!user) {
      // Log failed attempt
      await authDB.logVerificationAttempt({
        email: email,
        attemptType: 'login',
        isSuccessful: false,
        ipAddress: ipAddress,
        userAgent: userAgent
      })
      
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Check if account is locked
    if ((user as any).account_locked_until && new Date((user as any).account_locked_until) > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked due to multiple failed login attempts' })
    }

    // Verify password
    if (!(user as any).password_hash) {
      return res.status(400).json({ error: 'Password authentication not set up for this account' })
    }

    const passwordValid = await bcrypt.compare(password, (user as any).password_hash)
    
    if (!passwordValid) {
      // Increment failed login attempts
      const failedAttempts = ((user as any).failed_login_attempts || 0) + 1
      
      const client = await DatabasePool.getClient()
      try {
        // Update failed attempts
        await client.query(
          'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
          [failedAttempts, user.id]
        )
        
        // Lock account after 5 failed attempts
        if (failedAttempts >= 5) {
          const lockUntil = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
          await client.query(
            'UPDATE users SET account_locked_until = $1 WHERE id = $2',
            [lockUntil, user.id]
          )
        }
      } finally {
        client.release()
      }

      // Log failed attempt
      await authDB.logVerificationAttempt({
        email: email,
        attemptType: 'login',
        isSuccessful: false,
        ipAddress: ipAddress,
        userAgent: userAgent
      })
      
      if (failedAttempts >= 5) {
        return res.status(423).json({ error: 'Account locked due to multiple failed attempts. Try again in 30 minutes.' })
      }
      
      return res.status(401).json({ 
        error: 'Invalid email or password',
        attemptsRemaining: 5 - failedAttempts
      })
    }

    // Password is correct - reset failed attempts
    const resetClient = await DatabasePool.getClient()
    try {
      await resetClient.query(
        'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE id = $1',
        [user.id]
      )
    } finally {
      resetClient.release()
    }

    // Generate and send OTP for second factor authentication
    const otpCode = await authDB.createOTPCode({
      email: email,
      codeType: 'login',
      deliveryMethod: 'email',
      expiryMinutes: 10
    })

    // Send OTP via email using Resend
    const emailResult = await sendOTPEmail(email, otpCode, 'login')
    
    if (!emailResult.success) {
      return res.status(500).json({ 
        error: emailResult.error || 'Failed to send verification email',
        suggestion: 'Please try again'
      })
    }

    console.log(`🔐 Login OTP for ${email}: ${otpCode} (via email)`)
    console.log(`📧 Email sent successfully. ID: ${emailResult.messageId}`)

    // Log successful credential verification (but not complete login yet)
    await authDB.logVerificationAttempt({
      email: email,
      attemptType: 'login',
      isSuccessful: false, // Not complete until OTP verified
      ipAddress: ipAddress,
      userAgent: userAgent
    })

    console.log(`✅ Password verified for ${email}, OTP sent via email`)

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your email',
      otpSent: true,
      method: 'email'
    })

  } catch (error) {
    console.error('Login with password error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}