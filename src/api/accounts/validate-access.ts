import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

interface ValidationRequest {
  linkedAccountId: string
  dataType: string
  requiredPermission: string
}

/**
 * @openapi
 * /api/accounts/validate-access:
 *   post:
 *     summary: Validate access permissions for a linked account
 *     description: Confirms whether the authenticated user has permission to access a specific type of health data from a linked account.
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
 *               - dataType
 *               - requiredPermission
 *             properties:
 *               linkedAccountId:
 *                 type: string
 *                 description: ID of the linked account to validate
 *               dataType:
 *                 type: string
 *                 description: Type of data being requested (e.g., medications, vitals)
 *               requiredPermission:
 *                 type: string
 *                 description: Specific permission required to access the requested data
 *     responses:
 *       200:
 *         description: Access granted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 linkedUser:
 *                   type: string
 *                 permission:
 *                   type: string
 *                 relationshipType:
 *                   type: string
 *       400:
 *         description: Bad request — missing required fields
 *       401:
 *         description: Unauthorized — session token missing or invalid
 *       403:
 *         description: Forbidden — user lacks required permissions
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error or validation failure
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authorization token provided' })
  }

  const sessionToken = authHeader.split(' ')[1]

  try {
    console.log('🔐 Validating data access permissions...')

    // Get current user from session token
    const userResult = await dbPool.query(
      'SELECT user_email FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()',
      [sessionToken]
    )

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired session token' })
    }

    const currentUserEmail = userResult.rows[0].user_email
    const { linkedAccountId, dataType, requiredPermission }: ValidationRequest = req.body

    if (!linkedAccountId || !dataType || !requiredPermission) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    console.log(`🔐 Validating access: User ${currentUserEmail} requesting ${dataType} from account ${linkedAccountId}`)

    // Check if the linked account exists and user has permission
    const linkResult = await dbPool.query(`
      SELECT 
        la.id,
        la.linked_email,
        la.permissions,
        la.relationship_type,
        la.created_at
      FROM linked_accounts la
      WHERE la.id = $1 
        AND la.inviter_email = $2 
        AND la.is_active = true
    `, [linkedAccountId, currentUserEmail])

    if (linkResult.rows.length === 0) {
      console.log(`❌ No active linked account found: ${linkedAccountId} for user ${currentUserEmail}`)
      return res.status(403).json({ error: 'Linked account not found or access denied' })
    }

    const linkedAccount = linkResult.rows[0]
    const permissions = Array.isArray(linkedAccount.permissions) 
      ? linkedAccount.permissions 
      : JSON.parse(linkedAccount.permissions || '[]')

    console.log(`🔐 Linked account permissions:`, permissions)
    console.log(`🔐 Required permission:`, requiredPermission)

    // Check if user has the required permission
    const hasPermission = permissions.includes(requiredPermission) || permissions.includes('all_data')

    if (!hasPermission) {
      console.log(`❌ Permission denied: ${requiredPermission} not in ${permissions}`)
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        requiredPermission,
        availablePermissions: permissions
      })
    }

    console.log(`✅ Access granted: ${currentUserEmail} can access ${dataType} from ${linkedAccount.linked_email}`)

    // Log the access attempt for security auditing
    await dbPool.query(`
      INSERT INTO account_access_logs (
        requesting_user_email,
        linked_account_id,
        data_type,
        permission_used,
        access_granted,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `, [currentUserEmail, linkedAccountId, dataType, requiredPermission, true])

    return res.status(200).json({
      success: true,
      message: 'Access granted',
      linkedUser: linkedAccount.linked_email,
      permission: requiredPermission,
      relationshipType: linkedAccount.relationship_type
    })

  } catch (error) {
    console.error('❌ Error validating access:', error)

    // Log failed access attempt
    try {
      const { linkedAccountId, dataType, requiredPermission } = req.body
      const userResult = await dbPool.query(
        'SELECT user_email FROM user_sessions WHERE session_token = $1',
        [sessionToken]
      )
      
      if (userResult.rows.length > 0) {
        await dbPool.query(`
          INSERT INTO account_access_logs (
            requesting_user_email,
            linked_account_id,
            data_type,
            permission_used,
            access_granted,
            error_message,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [userResult.rows[0].user_email, linkedAccountId, dataType, requiredPermission, false, (error as Error).message])
      }
    } catch (logError) {
      console.error('Error logging failed access attempt:', logError)
    }

    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}