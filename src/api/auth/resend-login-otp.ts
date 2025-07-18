import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

interface ResendLoginOtpRequest {
  email: string
  method: 'email'
}

/**
 * @openapi
 * /api/auth/resend-login-otp:
 *   post:
 *     summary: Resend login OTP to user via specified method.
 *     description: Validates user's email and preferred delivery method, then issues a new one-time passcode (OTP) for authentication.
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
 *               - method
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email of the user to resend OTP.
 *               method:
 *                 type: string
 *                 enum: [email]
 *                 description: Preferred delivery method for the OTP. Currently only 'email' is supported.
 *     responses:
 *       200:
 *         description: OTP resent successfully.
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
 *         description: Missing or invalid parameters.
 *       404:
 *         description: User not found.
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
    const { email, method }: ResendLoginOtpRequest = req.body

    // Validate required fields
    if (!email || !method) {
      return res.status(400).json({ error: 'Email and method are required' })
    }

    // Find user to ensure they exist
    const user = await authDB.findUserByEmail(email)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Generate new OTP code
    const otpCode = await authDB.createOTPCode({
      email: email,
      codeType: 'login',
      deliveryMethod: method,
      expiryMinutes: 10
    })

    // TODO: Send OTP via email or SMS based on method
    console.log(`🔐 Resend Login OTP for ${email}: ${otpCode} (via ${method})`)

    res.status(200).json({
      success: true,
      message: `New verification code sent to your ${method}`
    })

  } catch (error) {
    console.error('Resend login OTP error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}