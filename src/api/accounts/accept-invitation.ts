import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { AccountLinkingDatabase } from '../../lib/account-linking-database'

/**
 * Accept or reject account link invitation
 * POST /api/accounts/accept-invitation
 */

/**
 * @openapi
 * /api/accounts/accept-invitation:
 *   post:
 *     summary: Accept or reject an account link invitation
 *     description: Authenticated users can accept or reject an invitation to link accounts.
 *     tags:
 *       - Accounts
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - linkToken
 *               - action
 *             properties:
 *               linkToken:
 *                 type: string
 *               action:
 *                 type: string
 *                 enum: [accept, reject]
 *               reciprocalPermissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Invitation accepted or rejected
 *       400:
 *         description: Bad request (missing or invalid fields)
 *       401:
 *         description: Unauthorized (missing or invalid session token)
 *       403:
 *         description: Forbidden (user cannot respond to this invitation)
 *       404:
 *         description: Invitation not found or expired
 *       500:
 *         description: Internal server error
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

    const { linkToken, action, reciprocalPermissions } = req.body

    // Validate required fields
    if (!linkToken || !action) {
      return res.status(400).json({ 
        error: 'Missing required fields: linkToken and action are required' 
      })
    }

    // Validate action
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action. Must be "accept" or "reject"' 
      })
    }

    console.log(`🔗 Processing invitation ${action} for token: ${linkToken}`)

    // Get invitation to verify it exists and user has access
    const invitation = await AccountLinkingDatabase.getInvitationByToken(linkToken)
    
    if (!invitation) {
      return res.status(404).json({ 
        error: 'Invitation not found or expired' 
      })
    }

    // Verify the user has the right to accept/reject this invitation
    if (invitation.invitee_email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({ 
        error: 'You are not authorized to respond to this invitation' 
      })
    }

    if (action === 'accept') {
      // Default to no permissions if not specified
      const accepteePermissions = reciprocalPermissions || []
      
      // Accept the invitation with custom permissions
      const linkedAccount = await AccountLinkingDatabase.acceptInvitation(linkToken, user.id, accepteePermissions)
      
      console.log(`✅ Account link accepted between ${invitation.inviter_email} and ${user.email}`)
      console.log(`📋 Acceptee permissions: ${JSON.stringify(accepteePermissions)}`)
      
      return res.status(200).json({
        success: true,
        message: 'Invitation accepted successfully',
        linked_account: {
          id: linkedAccount.id,
          linked_user_email: invitation.inviter_email,
          permissions: Array.isArray(linkedAccount.permissions) ? linkedAccount.permissions : JSON.parse(linkedAccount.permissions || '[]'),
          created_at: linkedAccount.created_at
        }
      })
    } else {
      // Reject the invitation
      const rejected = await AccountLinkingDatabase.rejectInvitation(linkToken)
      
      if (!rejected) {
        return res.status(400).json({ error: 'Failed to reject invitation' })
      }
      
      console.log(`❌ Account link rejected between ${invitation.inviter_email} and ${user.email}`)
      
      return res.status(200).json({
        success: true,
        message: 'Invitation rejected successfully'
      })
    }

  } catch (error) {
    console.error('Error processing invitation:', error)
    return res.status(500).json({ 
      error: 'Failed to process invitation',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}