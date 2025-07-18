import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import zxcvbn from 'zxcvbn'

interface PasswordStrengthRequest {
  password: string
}

interface PasswordStrengthResponse {
  score: number
  feedback: string[]
  isValid: boolean
  crack_times_display: any
  entropy: number
}

/**
 * @openapi
 * /api/auth/check-password-strength:
 *   post:
 *     summary: Analyze and validate password strength.
 *     description: Evaluates password strength using zxcvbn and custom medical app criteria to determine security, feedback, and entropy.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 description: The password to be evaluated.
 *     responses:
 *       200:
 *         description: Password evaluation results.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 score:
 *                   type: number
 *                   description: Adjusted password strength score (0–4).
 *                 feedback:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Suggestions for improving password strength.
 *                 isValid:
 *                   type: boolean
 *                   description: Indicates if the password meets all strength requirements.
 *                 crack_times_display:
 *                   type: object
 *                   additionalProperties: true
 *                   description: Estimated time to crack the password across various attack scenarios.
 *                 entropy:
 *                   type: number
 *                   description: Logarithmic entropy of the password (based on guesses).
 *       400:
 *         description: Missing password in request body.
 *       405:
 *         description: Method not allowed (only POST supported).
 *       500:
 *         description: Internal server error during password analysis.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { password }: PasswordStrengthRequest = req.body

    if (!password) {
      return res.status(400).json({ error: 'Password is required' })
    }

    // Use zxcvbn to analyze password strength
    const result = zxcvbn(password)

    // Additional custom validation for medical app security
    const customChecks = {
      minLength: password.length >= 12,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChars: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      avoidsMedicalTerms: !/(password|treatment|medical|ai|health|doctor|patient)/i.test(password),
      avoidsCommonPatterns: !/(.)\1{2,}/.test(password) // No character repeated 3+ times
    }

    // Enhanced feedback based on custom checks
    const customFeedback: string[] = []
    
    if (!customChecks.minLength) {
      customFeedback.push('Use at least 12 characters')
    }
    
    if (!customChecks.hasUppercase || !customChecks.hasLowercase) {
      customFeedback.push('Include both uppercase and lowercase letters')
    }
    
    if (!customChecks.hasNumbers) {
      customFeedback.push('Add at least one number')
    }
    
    if (!customChecks.hasSpecialChars) {
      customFeedback.push('Include special characters (!@#$%^&*)')
    }
    
    if (!customChecks.avoidsMedicalTerms) {
      customFeedback.push('Avoid medical terms and common words')
    }

    if (!customChecks.avoidsCommonPatterns) {
      customFeedback.push('Avoid repeating characters')
    }

    // Combine zxcvbn feedback with custom feedback
    const allFeedback = [
      ...result.feedback.suggestions,
      ...customFeedback
    ].filter(Boolean)

    // Calculate final score (minimum of zxcvbn score and custom checks)
    const customScore = Object.values(customChecks).filter(Boolean).length
    const adjustedScore = Math.min(result.score, Math.floor(customScore / 2))

    // Password is valid if it meets all custom requirements AND has good zxcvbn score
    const isValid = Object.values(customChecks).every(check => check) && 
                    result.score >= 3 && 
                    password.length >= 12

    const response: PasswordStrengthResponse = {
      score: adjustedScore,
      feedback: allFeedback,
      isValid: isValid,
      crack_times_display: result.crack_times_display,
      entropy: result.guesses_log10
    }

    res.status(200).json(response)

  } catch (error) {
    console.error('Password strength check error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}