import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { DatabasePool } from '../../lib/database-pool';

/**
 * Update permissions for a linked account
 * PUT /api/accounts/manage-permissions
 */

/**
 * @openapi
 * /api/accounts/manage-permissions:
 *   put:
 *     summary: Update permissions for a linked account
 *     description: Allows an authenticated user to modify granted permissions for one of their linked accounts.
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
 *               - newPermissions
 *             properties:
 *               linkedAccountId:
 *                 type: string
 *                 description: ID of the linked account
 *               newPermissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of updated permissions. Valid values include health_data, wearables, medications, lab_results, vitals, all_data, all.
 *     responses:
 *       200:
 *         description: Permissions updated successfully
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
 *                     linkedAccountId:
 *                       type: string
 *                     linkedUserEmail:
 *                       type: string
 *                     oldPermissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     newPermissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     updatedAt:
 *                       type: string
 *       400:
 *         description: Bad request — missing or invalid parameters
 *       401:
 *         description: Unauthorized — missing or invalid session token
 *       404:
 *         description: Linked account not found or access denied
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
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

    const { linkedAccountId, newPermissions } = req.body

    if (!linkedAccountId || !Array.isArray(newPermissions)) {
      return res.status(400).json({ 
        error: 'Missing required parameters: linkedAccountId and newPermissions' 
      })
    }

    // Validate permissions
    const validPermissions = [
      'health_data', 'wearables', 'medications', 'lab_results', 
      'vitals', 'all_data', 'all'
    ]
    const invalidPermissions = newPermissions.filter(p => !validPermissions.includes(p))
    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        error: `Invalid permissions: ${invalidPermissions.join(', ')}`,
        valid_permissions: validPermissions
      })
    }

    const pool = DatabasePool.getInstance()

    // Verify the linked account belongs to this user
    const verifyQuery = `
      SELECT id, linked_email, relationship_type, permissions
      FROM linked_accounts 
      WHERE id = $1 AND user_id = $2 AND is_active = true
    `
    const verifyResult = await pool.query(verifyQuery, [linkedAccountId, user.id])

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Linked account not found or access denied' })
    }

    const linkedAccount = verifyResult.rows[0]
    const oldPermissions = Array.isArray(linkedAccount.permissions) 
      ? linkedAccount.permissions 
      : JSON.parse(linkedAccount.permissions || '[]')

    // Update permissions
    const updateQuery = `
      UPDATE linked_accounts 
      SET permissions = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id, linked_email, permissions, updated_at
    `
    const updateResult = await pool.query(updateQuery, [
      JSON.stringify(newPermissions), 
      linkedAccountId, 
      user.id
    ])

    // Log permission change for audit trail
    const auditQuery = `
      INSERT INTO account_access_logs (
        requesting_user_email,
        linked_account_id,
        data_type,
        permission_used,
        access_granted,
        error_message,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `
    await pool.query(auditQuery, [
      user.email,
      linkedAccountId,
      'permission_change',
      'admin',
      true,
      `Permissions updated from [${oldPermissions.join(', ')}] to [${newPermissions.join(', ')}]`
    ])

    console.log(`🔐 Updated permissions for ${linkedAccount.linked_email}:`)
    console.log(`   Old: [${oldPermissions.join(', ')}]`)
    console.log(`   New: [${newPermissions.join(', ')}]`)

    return res.status(200).json({
      success: true,
      message: 'Permissions updated successfully',
      data: {
        linkedAccountId: updateResult.rows[0].id,
        linkedUserEmail: updateResult.rows[0].linked_email,
        oldPermissions,
        newPermissions,
        updatedAt: updateResult.rows[0].updated_at
      }
    })

  } catch (error) {
    console.error('❌ Error updating permissions:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}