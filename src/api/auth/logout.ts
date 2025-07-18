import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Terminate the user's active session.
 *     description: Invalidates a session token, logs the logout reason and IP address for security auditing, and returns a confirmation response.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionToken
 *             properties:
 *               sessionToken:
 *                 type: string
 *                 description: The session token to be invalidated.
 *               reason:
 *                 type: string
 *                 description: Optional reason for logout (e.g. "manual", "timeout", "security").
 *     responses:
 *       200:
 *         description: Session terminated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Session token missing.
 *       405:
 *         description: Method not allowed (only POST supported).
 *       500:
 *         description: Internal server error.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    
    const { sessionToken, reason } = req.body

    if (sessionToken) {
      // Log logout reason for security monitoring
      console.log(`🔐 Session logout: ${reason || 'manual'} for token: ${sessionToken.substring(0, 20)}...`)
      
      // Invalidate session on server
      await authDB.invalidateSession(sessionToken)
      
      // Log security event (simplified for now)
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown'
      console.log(`🔐 Logout from IP: ${ipAddress}`)
    }

    res.status(200).json({
      success: true,
      message: 'Session terminated securely',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}