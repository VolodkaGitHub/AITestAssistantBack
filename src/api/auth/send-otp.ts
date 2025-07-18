import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import { sendOTPEmail } from '../../lib/email-service'

interface SendOTPRequest {
  email: string
  method: 'email'
  type: 'signup' | 'login' | 'verification'
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Initialize database schema if needed
    await authDB.initializeSchema()
    
    const { email, method, type }: SendOTPRequest = req.body

    // Validate input
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' })
    }

    if (method !== 'email') {
      return res.status(400).json({ error: 'Only email delivery method is supported' })
    }

    if (!['signup', 'login', 'verification'].includes(type)) {
      return res.status(400).json({ error: 'Invalid OTP type' })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // Note: Email domain validation removed since we're using verified custom domain
    // All email addresses should work with opinions.doctor domain

    // For OTP-only authentication, we allow both login and signup
    // Users are automatically created when they verify their email
    // No need to check user existence - streamlined flow
    console.log(`Processing OTP request for ${email} (type: ${type})`)

    // Generate and store OTP code
    const code = await authDB.createOTPCode({
      email: email,
      codeType: type,
      deliveryMethod: 'email',
      expiryMinutes: 10
    })

    // Print verification code to console for testing
    console.log('\n' + '='.repeat(60))
    console.log(`🔐 VERIFICATION CODE for ${email}`)
    console.log(`📧 CODE: ${code}`)
    console.log('='.repeat(60) + '\n')

    // Send OTP via email using existing email service
    const emailResult = await sendOTPEmail(email, code, type)

    if (!emailResult.success) {
      return res.status(500).json({ 
        error: emailResult.error || 'Failed to send verification email',
        suggestion: 'Please try again or use a different email address'
      })
    }

    console.log(`OTP email sent successfully. ID: ${emailResult.messageId}`)

    // Log successful attempt (fix IP address parsing)
    const rawIp = req.headers['x-forwarded-for'] as string || req.connection.remoteAddress || ''
    const ipAddress = rawIp.split(',')[0].trim() // Take first IP from comma-separated list
    
    await authDB.logVerificationAttempt({
      email: email,
      attemptType: type,
      isSuccessful: true,
      ipAddress: ipAddress,
      userAgent: req.headers['user-agent']
    })

    res.status(200).json({ 
      success: true, 
      message: `OTP code sent successfully via ${method}`,
      expiresIn: 600, // 10 minutes in seconds
      // Include OTP in response for development (remove in production)
      ...(process.env.NODE_ENV === 'development' && { otp_code: code })
    })

  } catch (error) {
    console.error('Send OTP error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}