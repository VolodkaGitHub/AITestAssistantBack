import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

/**
 * @openapi
 * /api/auth/check-password-status:
 *   get:
 *     summary: Check if a user has set a password and completed their profile.
 *     description: Validates the session token, retrieves user data, and checks for password presence and profile completeness.
 *     tags:
 *       - Auth
 *     parameters:
 *       - in: query
 *         name: sessionToken
 *         required: true
 *         schema:
 *           type: string
 *         description: Session token used to identify and authenticate the user.
 *     responses:
 *       200:
 *         description: Password and profile status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 hasPassword:
 *                   type: boolean
 *                 hasCompleteProfile:
 *                   type: boolean
 *                 email:
 *                   type: string
 *                 firstName:
 *                   type: string
 *                 lastName:
 *                   type: string
 *                 isLegacyUser:
 *                   type: boolean
 *       400:
 *         description: Session token missing or invalid type.
 *       401:
 *         description: Invalid or expired session, or user not found.
 *       404:
 *         description: User associated with the session token not found.
 *       405:
 *         description: Method not allowed (only GET supported).
 *       500:
 *         description: Internal server error occurred while processing the request.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    return await handleCheckPasswordStatus(req, res)
  } catch (error) {
    console.error('Check password status API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function handleCheckPasswordStatus(req: NextApiRequest, res: NextApiResponse) {
  const { sessionToken } = req.query

  if (!sessionToken || typeof sessionToken !== 'string') {
    return res.status(400).json({ error: 'Session token is required' })
  }

  try {
    // Validate session and get user data
    const sessionData = await authDB.validateSession(sessionToken)
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    // Get user details
    const user = await authDB.getUserById(sessionData.id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if user has password set
    const hasPassword = !!(user as any).password_hash
    
    // Check if user has complete profile
    const hasCompleteProfile = !!(
      user.street_address_1 && 
      user.city && 
      user.state_province && 
      user.postal_code && 
      user.country
    )

    return res.status(200).json({
      success: true,
      hasPassword,
      hasCompleteProfile,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isLegacyUser: !hasPassword // User created before new signup process
    })
  } catch (error) {
    console.error('Check password status error:', error)
    return res.status(500).json({ error: 'Failed to check password status' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}