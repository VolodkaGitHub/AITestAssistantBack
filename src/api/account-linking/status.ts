import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

/**
 * Account Linking Status API
 * Returns user's account linking information
 */

/**
 * @openapi
 * /api/account-linking/status:
 *   get:
 *     summary: Get account linking status
 *     description: Returns linked accounts and pending invitations for the authenticated user.
 *     tags:
 *       - Account Linking
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with account linking data
 *       401:
 *         description: Unauthorized or invalid session token
 *       500:
 *         description: Internal server error
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate authentication
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' })
    }

    const token = authHeader.split(' ')[1]
    const user = await validateSessionToken(token)
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    // Check for linked accounts (if account linking table exists)
    let linkedAccounts = []
    let pendingInvitations = []

    try {
      // Try to get linked accounts
      const linkedQuery = `
        SELECT linked_user_email, permissions, created_at
        FROM linked_accounts 
        WHERE user_email = $1 AND is_active = true
        ORDER BY created_at DESC
      `
      const linkedResult = await dbPool.query(linkedQuery, [user.email])
      linkedAccounts = linkedResult.rows

      // Try to get pending invitations
      const pendingQuery = `
        SELECT inviter_email, permissions, created_at, expires_at
        FROM account_invitations 
        WHERE invitee_email = $1 AND status = 'pending' AND expires_at > NOW()
        ORDER BY created_at DESC
      `
      const pendingResult = await dbPool.query(pendingQuery, [user.email])
      pendingInvitations = pendingResult.rows

    } catch (dbError) {
      // Tables may not exist - return empty arrays
      console.log('Account linking tables not found, returning empty status')
    }

    return res.status(200).json({
      linkedAccounts,
      pendingInvitations,
      hasLinkedAccounts: linkedAccounts.length > 0,
      hasPendingInvitations: pendingInvitations.length > 0,
      totalLinkedAccounts: linkedAccounts.length,
      totalPendingInvitations: pendingInvitations.length
    })

  } catch (error) {
    console.error('Account linking status error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}