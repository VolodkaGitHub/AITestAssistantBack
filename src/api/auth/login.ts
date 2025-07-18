import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

interface LoginRequest {
  email: string
  otp?: string
}

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Complete login using email and OTP (or skip for testing).
 *     description: Verifies user existence and initiates a session. Currently skips OTP validation for testing purposes.
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
 *                 description: The user's email address.
 *               otp:
 *                 type: string
 *                 description: (Optional) OTP code for verification.
 *     responses:
 *       200:
 *         description: Login successful, session created.
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
 *       400:
 *         description: Missing required email.
 *       404:
 *         description: User not found.
 *       405:
 *         description: Method not allowed (only POST supported).
 *       500:
 *         description: Internal server error or unexpected failure.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    
    const { email, otp }: LoginRequest = req.body

    // Validate input
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    // Find user
    const user = await authDB.findUserByEmail(email)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // For testing: Skip OTP validation and create session directly
    const sessionToken = require('crypto').randomUUID()
    const ipAddress = (req.headers['x-forwarded-for'] as string) || 'unknown'
    const userAgent = req.headers['user-agent'] || 'unknown'
    
    await authDB.createSession(user.id, sessionToken, ipAddress, userAgent)

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      },
      sessionToken
    })

  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}