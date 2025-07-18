import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import { withScalableMiddleware } from '../../lib/api-middleware'

interface VerifyOTPRequest {
  email: string
  otpCode: string
  purpose: 'signup' | 'login' | 'verification'
  userData?: {
    firstName: string
    lastName: string
    dateOfBirth: string
    gender: string
    phone?: string
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    
    const { email, otpCode, purpose, userData }: VerifyOTPRequest = req.body
    
    // Validate required fields
    if (!email || !otpCode || !purpose) {
      return res.status(400).json({ error: 'Email, OTP code, and purpose are required' })
    }

    // Verify OTP code
    const verification = await authDB.verifyOTPCode({
      email,
      code: otpCode,
      codeType: purpose
    })
    const isValidOTP = verification.valid
    
    if (!isValidOTP) {
      return res.status(400).json({ 
        error: 'Invalid or expired verification code. Please request a new one.',
        shouldRequestNewOTP: true
      })
    }

    console.log(`✅ OTP verified successfully for ${email} - ${purpose}`)

    if (purpose === 'signup') {
      // Create new user account
      if (!userData) {
        return res.status(400).json({ error: 'User data required for signup' })
      }

      const newUser = await authDB.createUser({
        email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        dateOfBirth: userData.dateOfBirth,
        genderAtBirth: userData.gender,
        phone: userData.phone,
        isVerified: true
      })

      if (!newUser) {
        return res.status(500).json({ error: 'Failed to create user account' })
      }

      // Create session for new user
      const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const session = await authDB.createUserSession(
        newUser.id,
        sessionToken,
        (req.headers['x-forwarded-for'] as string) || 'unknown',
        req.headers['user-agent'] || 'unknown'
      )

      console.log(`✅ New user created and logged in: ${email}`)

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.first_name,
          lastName: newUser.last_name,
          isVerified: newUser.is_verified
        },
        sessionToken: sessionToken,
        expiresIn: 7 * 24 * 60 * 60 * 1000 // 7 days
      })

    } else if (purpose === 'login') {
      // Login existing user or create if doesn't exist (streamlined OTP flow)
      let user = await authDB.getUserByEmail(email)
      
      if (!user) {
        // Auto-create user for OTP-only authentication
        user = await authDB.createUser({
          email,
          firstName: email.split('@')[0], // Use email prefix as default name
          lastName: '',
          isVerified: true
        })
        console.log(`✅ Auto-created user during login: ${email}`)
      }

      // Create session for login
      const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const session = await authDB.createUserSession(
        user!.id,
        sessionToken,
        (req.headers['x-forwarded-for'] as string) || 'unknown',
        req.headers['user-agent'] || 'unknown'
      )

      console.log(`✅ User logged in successfully: ${email}`)

      res.status(200).json({
        success: true,
        message: 'Login successful',
        user: {
          id: user!.id,
          email: user!.email,
          firstName: user!.first_name,
          lastName: user!.last_name,
          isVerified: user!.is_verified
        },
        sessionToken: sessionToken,
        expiresIn: 7 * 24 * 60 * 60 * 1000 // 7 days
      })

    } else {
      // General verification
      res.status(200).json({
        success: true,
        message: 'Verification successful',
        email: email
      })
    }

  } catch (error) {
    console.error('OTP verification error:', error)
    res.status(500).json({ 
      error: 'Internal server error. Please try again.',
      canRetry: true
    })
  }
}

// Export with rate limiting protection
export default withScalableMiddleware('GENERAL_API', {
  requireSession: false,
  requireUserContext: false
})(handler)

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}