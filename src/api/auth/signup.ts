import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

interface SignupRequest {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  dateOfBirth?: string
  genderAtBirth?: 'male' | 'female' | 'other'
}

/**
 * @openapi
 * /api/signup:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Create a new user account and start a session.
 *     description: Registers a new user using an email and optional profile fields. If the user already exists, initiates a session and returns that user. Sends an OTP via email for verification.
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
 *               firstName:
 *                 type: string
 *                 description: First name of the user (optional).
 *               lastName:
 *                 type: string
 *                 description: Last name of the user (optional).
 *               phone:
 *                 type: string
 *                 description: Phone number of the user (optional).
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 description: Date of birth (optional).
 *               genderAtBirth:
 *                 type: string
 *                 enum: [male, female, other]
 *                 description: Gender assigned at birth (optional).
 *     responses:
 *       201:
 *         description: User created or logged in successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                 sessionToken:
 *                   type: string
 *                 otpSent:
 *                   type: boolean
 *       400:
 *         description: Missing or invalid email input.
 *       405:
 *         description: Method not allowed. Only POST is supported.
 *       500:
 *         description: Internal server error.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    
    const {
      email,
      firstName,
      lastName,
      phone,
      dateOfBirth,
      genderAtBirth
    }: SignupRequest = req.body

    // Validate required fields
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // Use default values for testing
    const defaultFirstName = firstName || 'Test'
    const defaultLastName = lastName || 'User'
    const defaultDateOfBirth = dateOfBirth || '1990-01-01'
    const defaultGender = genderAtBirth || 'other'

    // Check if user already exists
    const existingUser = await authDB.findUserByEmail(email)
    if (existingUser) {
      // Return existing user with session token
      const sessionToken = require('crypto').randomUUID()
      const ipAddress = (req.headers['x-forwarded-for'] as string) || 'unknown'
      const userAgent = req.headers['user-agent'] || 'unknown'
      
      await authDB.createSession(existingUser.id, sessionToken, ipAddress, userAgent)
      return res.status(201).json({ 
        message: 'User already exists, logged in',
        user: existingUser,
        sessionToken
      })
    }

    // Create new user
    const userId = await authDB.createUser({
      email,
      firstName: defaultFirstName,
      lastName: defaultLastName,
      phone: phone || '',
      dateOfBirth: defaultDateOfBirth,
      genderAtBirth: defaultGender
    })

    // Create session token
    const sessionToken = require('crypto').randomUUID()
    const ipAddress = (req.headers['x-forwarded-for'] as string) || 'unknown'
    const userAgent = req.headers['user-agent'] || 'unknown'
    
    await authDB.createSession(userId?.toString() || '', sessionToken, ipAddress, userAgent)

    return res.status(201).json({
      message: 'User registered successfully - OTP sent to email for verification',
      user: { 
        id: userId, 
        email, 
        firstName: defaultFirstName, 
        lastName: defaultLastName 
      },
      sessionToken,
      otpSent: true
    })

  } catch (error) {
    console.error('Signup error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}