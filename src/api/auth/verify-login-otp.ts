import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import { randomBytes } from 'crypto'

interface VerifyLoginOtpRequest {
  email: string
  otpCode: string
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, otpCode }: VerifyLoginOtpRequest = req.body

    // Validate required fields
    if (!email || !otpCode) {
      return res.status(400).json({ error: 'Email and verification code are required' })
    }

    // Get client IP and User-Agent
    const rawIp = req.headers['x-forwarded-for'] as string || req.connection.remoteAddress || ''
    const ipAddress = rawIp.split(',')[0].trim()
    const userAgent = req.headers['user-agent'] || ''

    // Verify OTP code
    const otpVerification = await authDB.verifyOTPCode({
      email: email,
      code: otpCode,
      codeType: 'login'
    })

    if (!otpVerification.valid) {
      // Log failed OTP attempt
      await authDB.logVerificationAttempt({
        email: email,
        attemptType: 'login',
        isSuccessful: false,
        ipAddress: ipAddress,
        userAgent: userAgent
      })

      return res.status(400).json({ 
        error: otpVerification.error || 'Invalid verification code',
        attempts: otpVerification.attempts
      })
    }

    // Get user data
    const user = await authDB.findUserByEmail(email)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Generate session token
    const sessionToken = randomBytes(32).toString('hex')

    // Create user session
    const session = await authDB.createUserSession(
      user.id,
      sessionToken,
      ipAddress,
      userAgent,
      4 // 4 hours (enhanced security)
    )

    if (!session) {
      return res.status(500).json({ error: 'Failed to create user session' })
    }

    // Log successful login
    await authDB.logVerificationAttempt({
      email: email,
      attemptType: 'login',
      isSuccessful: true,
      ipAddress: ipAddress,
      userAgent: userAgent
    })

    console.log(`✅ User logged in successfully: ${email}`)

    // Return user data and session token (excluding password hash)
    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        date_of_birth: user.date_of_birth,
        gender_at_birth: user.gender_at_birth,
        is_verified: user.is_verified,
        created_at: user.created_at
      },
      sessionToken: sessionToken
    })

  } catch (error) {
    console.error('Verify login OTP error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}