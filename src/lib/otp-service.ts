/**
 * OTP Service Module
 * Handles OTP generation, validation, and email delivery
 */

import { authDB } from './auth-database'
import { sendOTPEmail } from './email-service'

export interface OTPRequest {
  email: string
  purpose: 'signup' | 'login' | 'verification'
  ipAddress?: string
  userAgent?: string
}

export interface OTPVerification {
  email: string
  code: string
  codeType: 'signup' | 'login' | 'verification'
}

export interface OTPResponse {
  success: boolean
  message: string
  attempts?: number
  nextAllowedTime?: string
}

export class OTPService {
  /**
   * Generate a random 6-digit OTP code
   */
  static generateOTPCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  /**
   * Request OTP code via email
   */
  static async requestOTP(request: OTPRequest): Promise<OTPResponse> {
    try {
      console.log(`📧 OTP request for ${request.email} (${request.purpose})`)

      // Initialize database schema
      await authDB.initializeSchema()

      // Generate OTP code
      const otpCode = this.generateOTPCode()

      // Store OTP in database using existing method
      const stored = await authDB.storeOTPCode(request.email, otpCode, request.purpose)
      
      if (!stored) {
        return {
          success: false,
          message: 'Failed to store verification code. Please try again.'
        }
      }

      // Send email
      const emailResult = await sendOTPEmail(
        request.email,
        otpCode,
        request.purpose
      )

      if (!emailResult.success) {
        console.error('❌ Failed to send OTP email:', emailResult.error)
        return {
          success: false,
          message: 'Failed to send verification email. Please try again.'
        }
      }

      console.log(`✅ OTP sent successfully to ${request.email}`)

      return {
        success: true,
        message: 'Verification code sent to your email'
      }

    } catch (error) {
      console.error('❌ OTP request error:', error)

      return {
        success: false,
        message: 'Internal server error. Please try again.'
      }
    }
  }

  /**
   * Verify OTP code
   */
  static async verifyOTP(verification: OTPVerification): Promise<OTPResponse> {
    try {
      console.log(`🔍 Verifying OTP for ${verification.email} (${verification.codeType})`)

      // Initialize database schema
      await authDB.initializeSchema()

      // Verify OTP code
      const result = await authDB.verifyOTPCode(verification)

      if (!result.valid) {
        console.log(`❌ Invalid OTP for ${verification.email}: ${result.error}`)
        return {
          success: false,
          message: result.error || 'Invalid or expired verification code',
          attempts: result.attempts
        }
      }

      console.log(`✅ OTP verified successfully for ${verification.email}`)

      return {
        success: true,
        message: 'Verification code confirmed'
      }

    } catch (error) {
      console.error('❌ OTP verification error:', error)
      return {
        success: false,
        message: 'Internal server error. Please try again.'
      }
    }
  }

  /**
   * Generate and send OTP for signup
   */
  static async sendSignupOTP(email: string): Promise<OTPResponse> {
    return this.requestOTP({
      email,
      purpose: 'signup'
    })
  }

  /**
   * Generate and send OTP for login
   */
  static async sendLoginOTP(email: string): Promise<OTPResponse> {
    return this.requestOTP({
      email,
      purpose: 'login'
    })
  }

  /**
   * Verify signup OTP
   */
  static async verifySignupOTP(email: string, code: string): Promise<OTPResponse> {
    return this.verifyOTP({
      email,
      code,
      codeType: 'signup'
    })
  }

  /**
   * Verify login OTP
   */
  static async verifyLoginOTP(email: string, code: string): Promise<OTPResponse> {
    return this.verifyOTP({
      email,
      code,
      codeType: 'login'
    })
  }
}

export default OTPService

// Create instance for export compatibility
export const otpService = new OTPService()