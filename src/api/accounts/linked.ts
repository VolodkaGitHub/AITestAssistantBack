import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { AccountLinkingDatabase } from '../../lib/account-linking-database'

/**
 * Get linked accounts and pending invitations
 * GET /api/accounts/linked
 */

/**
 * @openapi
 * /api/accounts/linked:
 *   get:
 *     summary: Retrieve linked accounts and pending invitations
 *     description: Authenticated users can fetch linked accounts, invitations they have received, and invitations they have sent.
 *     tags:
 *       - Accounts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Linked accounts and invitations successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     linked_accounts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           linked_user_email:
 *                             type: string
 *                           relationship_type:
 *                             type: string
 *                           permissions:
 *                             type: array
 *                             items:
 *                               type: string
 *                           created_at:
 *                             type: string
 *                           is_inviter:
 *                             type: boolean
 *                     pending_invitations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           inviter_email:
 *                             type: string
 *                           permissions:
 *                             type: array
 *                             items:
 *                               type: string
 *                           created_at:
 *                             type: string
 *                           expires_at:
 *                             type: string
 *                           link_token:
 *                             type: string
 *                     sent_invitations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           invitee_email:
 *                             type: string
 *                           permissions:
 *                             type: array
 *                             items:
 *                               type: string
 *                           status:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                           expires_at:
 *                             type: string
 *                           accepted_at:
 *                             type: string
 *                             nullable: true
 *                           rejected_at:
 *                             type: string
 *                             nullable: true
 *                           link_token:
 *                             type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_links:
 *                           type: integer
 *                         pending_received:
 *                           type: integer
 *                         pending_sent:
 *                           type: integer
 *       401:
 *         description: Unauthorized — missing or invalid authorization token
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate session
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization token' })
    }

    const sessionToken = authHeader.substring(7)
    const user = await validateSessionToken(sessionToken)
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    console.log(`📋 Fetching linked accounts for user: ${user.email} (ID: ${user.id})`)

    // Get linked accounts
    const linkedAccounts = await AccountLinkingDatabase.getLinkedAccounts(user.id)
    console.log(`📋 Found ${linkedAccounts.length} linked accounts`)
    
    // Get pending invitations (received)
    const pendingInvitations = await AccountLinkingDatabase.getPendingInvitations(user.email)
    
    // Get sent invitations
    const sentInvitations = await AccountLinkingDatabase.getSentInvitations(user.id)

    // Format response
    const formattedLinkedAccounts = linkedAccounts.map(account => ({
      id: account.id,
      linked_user_email: account.linked_email,
      relationship_type: account.relationship_type,
      permissions: Array.isArray(account.permissions) ? account.permissions : JSON.parse(account.permissions || '[]'),
      created_at: account.created_at,
      is_inviter: account.inviter_email === user.email
    }))

    const formattedPendingInvitations = pendingInvitations.map(invite => ({
      id: invite.id,
      inviter_email: invite.inviter_email,
      permissions: Array.isArray(invite.permissions) ? invite.permissions : JSON.parse(invite.permissions || '[]'),
      created_at: invite.created_at,
      expires_at: invite.expires_at,
      link_token: invite.link_token
    }))

    const formattedSentInvitations = sentInvitations.map(invite => ({
      id: invite.id,
      invitee_email: invite.invitee_email,
      permissions: Array.isArray(invite.permissions) ? invite.permissions : JSON.parse(invite.permissions || '[]'),
      status: invite.status,
      created_at: invite.created_at,
      expires_at: invite.expires_at,
      accepted_at: invite.accepted_at,
      rejected_at: invite.rejected_at,
      link_token: invite.link_token
    }))

    return res.status(200).json({
      success: true,
      data: {
        linked_accounts: formattedLinkedAccounts,
        pending_invitations: formattedPendingInvitations,
        sent_invitations: formattedSentInvitations,
        summary: {
          total_links: formattedLinkedAccounts.length,
          pending_received: formattedPendingInvitations.length,
          pending_sent: formattedSentInvitations.filter(inv => inv.status === 'pending').length
        }
      }
    })

  } catch (error) {
    console.error('Error fetching linked accounts:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch linked accounts',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}