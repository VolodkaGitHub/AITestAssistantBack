import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import { OTPService } from '../../lib/otp-service'
import { ExtendedNextApiRequest, withScalableMiddleware } from '../../lib/api-middleware'

interface OTPRequest {
  email: string
  purpose: 'signup' | 'login' | 'verification'
}

/**
 * @openapi
 * /api/auth/request-otp:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Request an OTP for authentication purposes.
 *     description: Sends an OTP to the specified email address for signup, login, or identity verification. Performs basic validation and existence checks based on purpose.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - purpose
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The user's email address.
 *               purpose:
 *                 type: string
 *                 enum: [signup, login, verification]
 *                 description: The context for the OTP request.
 *     responses:
 *       200:
 *         description: OTP sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 email:
 *                   type: string
 *                 purpose:
 *                   type: string
 *                   enum: [signup, login, verification]
 *                 expiresIn:
 *                   type: number
 *                   description: Expiry time in milliseconds.
 *       400:
 *         description: Invalid or missing input parameters.
 *       404:
 *         description: No user found (for login).
 *       409:
 *         description: User already exists (for signup).
 *       405:
 *         description: Method not allowed. Only POST supported.
 *       500:
 *         description: Server error or OTP dispatch failure.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    
    const { email, purpose = 'login' }: OTPRequest = req.body
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Valid email address is required' })
    }

    // Basic validation for purpose
    if (!['signup', 'login', 'verification'].includes(purpose)) {
      return res.status(400).json({ error: 'Invalid purpose specified' })
    }

    // For signup, check if user already exists
    if (purpose === 'signup') {
      const existingUser = await authDB.getUserByEmail(email)
      if (existingUser) {
        return res.status(409).json({ 
          error: 'Account already exists. Please use login instead.',
          shouldRedirectToLogin: true
        })
      }
    }

    // For login, check if user exists
    if (purpose === 'login') {
      const existingUser = await authDB.getUserByEmail(email)
      if (!existingUser) {
        return res.status(404).json({ 
          error: 'No account found with this email. Please sign up first.',
          shouldRedirectToSignup: true
        })
      }
    }

    // Send OTP via email using OTPService
    const result = await OTPService.requestOTP({
      email,
      purpose,
      ipAddress: req.headers['x-forwarded-for'] as string || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    })
    
    if (result.success) {
      console.log(`✅ OTP sent successfully to ${email} for ${purpose}`)
      res.status(200).json({ 
        success: true,
        message: result.message,
        email: email,
        purpose: purpose,
        expiresIn: 10 * 60 * 1000 // 10 minutes
      })
    } else {
      console.error(`❌ Failed to send OTP to ${email}: ${result.message}`)
      res.status(500).json({ 
        error: result.message || 'Failed to send verification email. Please try again.',
        canRetry: true
      })
    }

  } catch (error) {
    console.error('OTP request error:', error)
    res.status(500).json({ 
      error: 'Internal server error. Please try again.',
      canRetry: true
    })
  }
}

function expressAdapter(
  originalHandler: (req: ExtendedNextApiRequest, res: NextApiResponse) => Promise<void>
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response) => {
    const extendedReq = req as unknown as ExtendedNextApiRequest
    const extendedRes = res as unknown as NextApiResponse
    await originalHandler(extendedReq, extendedRes)
  }
}

export default expressAdapter(
  withScalableMiddleware('GENERAL_API', {
    requireSession: false,
    requireUserContext: false
  })(handler)
)