import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { DatabasePool } from '../../lib/database-pool';

/**
 * Unlink a connected account
 * DELETE /api/accounts/unlink
 */

/**
 * @openapi
 * /api/accounts/unlink:
 *   delete:
 *     summary: Unlink a connected account
 *     description: Authenticated users can unlink previously connected accounts. This operation performs a soft delete and logs the action for auditing.
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
 *               - linkedAccountId
 *             properties:
 *               linkedAccountId:
 *                 type: string
 *                 description: The ID of the account to unlink
 *               confirmEmail:
 *                 type: string
 *                 description: Optional email confirmation to prevent accidental unlinking
 *     responses:
 *       200:
 *         description: Account successfully unlinked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     unlinkedAccount:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         relationshipType:
 *                           type: string
 *                         wasLinkedSince:
 *                           type: string
 *                         hadPermissions:
 *                           type: array
 *                           items:
 *                             type: string
 *                     unlinkedAt:
 *                       type: string
 *       400:
 *         description: Bad request — missing parameters or email mismatch
 *       401:
 *         description: Unauthorized — invalid or missing session token
 *       404:
 *         description: Linked account not found or access denied
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
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

    const { linkedAccountId, confirmEmail } = req.body

    if (!linkedAccountId) {
      return res.status(400).json({ 
        error: 'Missing required parameter: linkedAccountId' 
      })
    }

    // Get linked account details for confirmation and audit
    const getAccountClient = await DatabasePool.getClient()
    let linkedAccount
    try {
      const getAccountQuery = `
        SELECT 
          id, 
          linked_user_id, 
          linked_email, 
          relationship_type, 
          permissions,
          created_at
        FROM linked_accounts 
        WHERE id = $1 AND user_id = $2 AND is_active = true
      `
      const accountResult = await getAccountClient.query(getAccountQuery, [linkedAccountId, user.id])

      if (accountResult.rows.length === 0) {
        return res.status(404).json({ error: 'Linked account not found or access denied' })
      }

      linkedAccount = accountResult.rows[0]
    } finally {
      getAccountClient.release()
    }

    // Optional email confirmation check for security
    if (confirmEmail && confirmEmail !== linkedAccount.linked_email) {
      return res.status(400).json({ 
        error: 'Email confirmation does not match linked account email' 
      })
    }

    // Start transaction to ensure data consistency
    const client = await DatabasePool.getClient()
    
    try {
      await client.query('BEGIN')

      // Mark the account as inactive (soft delete)
      await client.query(`
        UPDATE linked_accounts 
        SET is_active = false, unlinked_at = NOW()
        WHERE id = $1 AND user_id = $2
      `, [linkedAccountId, user.id])

      // Also check for bidirectional link and remove if it exists
      await client.query(`
        UPDATE linked_accounts 
        SET is_active = false, unlinked_at = NOW()
        WHERE linked_user_id = $1 AND user_id = $2 AND is_active = true
      `, [user.id, linkedAccount.linked_user_id])

      // Log the unlink action for audit trail
      await client.query(`
        INSERT INTO account_access_logs (
          requesting_user_email,
          linked_account_id,
          data_type,
          permission_used,
          access_granted,
          error_message,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        user.email,
        linkedAccountId,
        'account_unlink',
        'admin',
        true,
        `Account unlinked: ${linkedAccount.linked_email} (${linkedAccount.relationship_type})`
      ])

      await client.query('COMMIT')

      // Parse permissions safely
      let permissions = []
      try {
        if (typeof linkedAccount.permissions === 'string') {
          // Handle single string values like "all_data"
          if (linkedAccount.permissions.startsWith('[') || linkedAccount.permissions.startsWith('{')) {
            permissions = JSON.parse(linkedAccount.permissions)
          } else {
            permissions = [linkedAccount.permissions]
          }
        } else if (Array.isArray(linkedAccount.permissions)) {
          permissions = linkedAccount.permissions
        }
      } catch (e) {
        permissions = [linkedAccount.permissions || 'unknown']
      }

      console.log(`🔓 Successfully unlinked account: ${linkedAccount.linked_email}`)
      console.log(`   Relationship: ${linkedAccount.relationship_type}`)
      console.log(`   Original permissions: [${permissions.join(', ')}]`)
      console.log(`   Linked since: ${linkedAccount.created_at}`)

      return res.status(200).json({
        success: true,
        message: 'Account successfully unlinked',
        data: {
          unlinkedAccount: {
            id: linkedAccount.id,
            email: linkedAccount.linked_email,
            relationshipType: linkedAccount.relationship_type,
            wasLinkedSince: linkedAccount.created_at,
            hadPermissions: permissions
          },
          unlinkedAt: new Date().toISOString()
        }
      })

    } catch (transactionError) {
      await client.query('ROLLBACK')
      throw transactionError
    } finally {
      client.release()
    }

  } catch (error) {
    console.error('❌ Error unlinking account:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}