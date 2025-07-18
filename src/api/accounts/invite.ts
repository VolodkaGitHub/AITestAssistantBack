import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { AccountLinkingDatabase } from '../../lib/account-linking-database'

/**
 * Create account link invitation
 * POST /api/accounts/invite
 */

/**
 * @openapi
 * /api/accounts/invite:
 *   post:
 *     summary: Create a new account link invitation
 *     description: Authenticated users can invite another person to link accounts, specifying permissions and relationship type.
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
 *               - inviteeEmail
 *               - permissions
 *             properties:
 *               inviteeEmail:
 *                 type: string
 *                 format: email
 *               relationshipType:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Valid permissions include health_data, wearables, medications, lab_results, vitals, all
 *               message:
 *                 type: string
 *                 description: Optional message to be included with the invitation
 *     responses:
 *       201:
 *         description: Invitation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 invitation:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     invitee_email:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     expires_at:
 *                       type: string
 *                     link_token:
 *                       type: string
 *                     status:
 *                       type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request — missing or invalid fields
 *       401:
 *         description: Unauthorized — invalid or missing session token
 *       405:
 *         description: Method not allowed
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

    const { inviteeEmail, relationshipType, permissions, message } = req.body

    // Validate required fields
    if (!inviteeEmail || !Array.isArray(permissions)) {
      return res.status(400).json({ 
        error: 'Missing required fields: inviteeEmail and permissions are required' 
      })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteeEmail)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // Prevent self-invitation
    if (inviteeEmail.toLowerCase() === user.email.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot invite yourself' })
    }

    // Validate permissions
    const validPermissions = ['health_data', 'wearables', 'medications', 'lab_results', 'vitals', 'all']
    const invalidPerms = permissions.filter((p: string) => !validPermissions.includes(p))
    if (invalidPerms.length > 0) {
      return res.status(400).json({ 
        error: `Invalid permissions: ${invalidPerms.join(', ')}`,
        valid_permissions: validPermissions
      })
    }

    console.log(`📧 Creating account link invitation from ${user.email} to ${inviteeEmail}`)

    // Create invitation
    const invitation = await AccountLinkingDatabase.createInvitation(
      user.id,
      user.email,
      inviteeEmail,
      relationshipType || 'other',
      permissions,
      168 // 7 days expiration
    )

    // Email notification handled by frontend after successful invitation creation

    console.log(`✅ Account link invitation created with token: ${invitation.link_token}`)

    return res.status(201).json({
      success: true,
      invitation: {
        id: invitation.id,
        invitee_email: invitation.invitee_email,
        permissions: Array.isArray(invitation.permissions) ? invitation.permissions : JSON.parse(invitation.permissions || '[]'),
        expires_at: invitation.expires_at,
        link_token: invitation.link_token,
        status: invitation.status
      },
      message: 'Invitation created successfully'
    })

  } catch (error) {
    console.error('Error creating account link invitation:', error)
    return res.status(500).json({ 
      error: 'Failed to create invitation',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}