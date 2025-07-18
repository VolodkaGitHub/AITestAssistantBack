import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

interface SignupWithPasswordRequest {
  email: string
  firstName: string
  lastName: string
  phone: string
  dateOfBirth: string
  genderAtBirth: 'male' | 'female' | 'other'
  password: string
  streetAddress1: string
  streetAddress2?: string
  city: string
  stateProvince: string
  postalCode: string
  country: string
  twoFactorMethod: 'email' | 'sms'
  backupPhone?: string
  otpCode: string
  captchaToken: string
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Initialize database schema if needed
    await authDB.initializeSchema()
    
    const {
      email,
      firstName,
      lastName,
      phone,
      dateOfBirth,
      genderAtBirth,
      password,
      streetAddress1,
      streetAddress2,
      city,
      stateProvince,
      postalCode,
      country,
      twoFactorMethod,
      backupPhone,
      otpCode,
      captchaToken
    }: SignupWithPasswordRequest = req.body

    // Validate required fields
    if (!email || !firstName || !lastName || !password || !otpCode) {
      return res.status(400).json({ error: 'Required fields missing' })
    }

    // Validate CAPTCHA token
    if (!captchaToken) {
      return res.status(400).json({ error: 'CAPTCHA verification required' })
    }

    // TODO: Verify Turnstile CAPTCHA token with Cloudflare
    // For now, we'll skip CAPTCHA verification in development
    if (process.env.NODE_ENV === 'production' && process.env.TURNSTILE_SECRET_KEY) {
      const captchaResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: captchaToken,
          remoteip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
        })
      })

      const captchaResult = await captchaResponse.json()
      if (!captchaResult.success) {
        return res.status(400).json({ error: 'CAPTCHA verification failed' })
      }
    }

    // Verify OTP code
    const otpVerification = await authDB.verifyOTPCode({
      email: email,
      code: otpCode,
      codeType: 'signup'
    })

    if (!otpVerification.valid) {
      return res.status(400).json({ 
        error: otpVerification.error || 'Invalid verification code',
        attempts: otpVerification.attempts
      })
    }

    // Check if user already exists
    const existingUser = await authDB.findUserByEmail(email)
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email' })
    }

    // Hash password with high salt rounds for medical data security
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Generate session token
    const sessionToken = randomBytes(32).toString('hex')

    // Get client IP and User-Agent
    const rawIp = req.headers['x-forwarded-for'] as string || req.connection.remoteAddress || ''
    const ipAddress = rawIp.split(',')[0].trim()
    const userAgent = req.headers['user-agent'] || ''

    // Create user account with all information
    const userId = await authDB.createUserWithPassword({
      email,
      firstName,
      lastName,
      phone,
      dateOfBirth,
      genderAtBirth,
      passwordHash,
      streetAddress1,
      streetAddress2: streetAddress2 || '',
      city,
      stateProvince,
      postalCode,
      country,
      twoFactorMethod,
      backupPhone: backupPhone || ''
    })

    if (!userId) {
      return res.status(500).json({ error: 'Failed to create user account' })
    }

    // Create user session
    const session = await authDB.createUserSession(
      userId,
      sessionToken,
      ipAddress,
      userAgent,
      24 // 24 hours
    )

    if (!session) {
      return res.status(500).json({ error: 'Failed to create user session' })
    }

    // Get created user data
    const newUser = await authDB.getUserById(userId)
    if (!newUser) {
      return res.status(500).json({ error: 'Failed to retrieve user data' })
    }

    // Log successful signup
    await authDB.logVerificationAttempt({
      email: email,
      attemptType: 'signup',
      isSuccessful: true,
      ipAddress: ipAddress,
      userAgent: userAgent
    })

    console.log(`✅ New user account created: ${email}`)

    // Return user data and session token (excluding password hash)
    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        phone: newUser.phone,
        date_of_birth: newUser.date_of_birth,
        gender_at_birth: newUser.gender_at_birth,
        is_verified: true, // Email verified through OTP
        created_at: newUser.created_at
      },
      sessionToken: sessionToken,
      twoFactorEnabled: true,
      preferredMethod: twoFactorMethod
    })

  } catch (error) {
    console.error('Signup with password error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}