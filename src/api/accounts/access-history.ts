import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { DatabasePool } from '../../lib/database-pool';

interface AccessLogEntry {
  id: string
  requesting_user_email: string
  linked_account_id: string
  data_type: string
  permission_used: string
  access_granted: boolean
  error_message?: string
  created_at: string
  linked_user_name?: string
  linked_user_email?: string
}

interface AccessStats {
  linked_account_id: string
  linked_user_email: string
  linked_user_name: string
  total_accesses: number
  last_access: string
  data_types_accessed: string[]
  access_frequency: {
    daily: number
    weekly: number
    monthly: number
  }
}

/**
 * Get access history and statistics for linked accounts
 * GET /api/accounts/access-history
 */

/**
 * @openapi
 * /api/accounts/access-history:
 *   get:
 *     summary: Fetch access history and statistics for linked accounts
 *     description: Returns access logs and usage stats for accounts linked to the authenticated user.
 *     tags:
 *       - Accounts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Access history and statistics retrieved successfully
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
 *                     access_logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           requesting_user_email:
 *                             type: string
 *                           linked_account_id:
 *                             type: string
 *                           data_type:
 *                             type: string
 *                           permission_used:
 *                             type: string
 *                           access_granted:
 *                             type: boolean
 *                           error_message:
 *                             type: string
 *                             nullable: true
 *                           created_at:
 *                             type: string
 *                           linked_user_name:
 *                             type: string
 *                           linked_user_email:
 *                             type: string
 *                     access_stats:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           linked_account_id:
 *                             type: string
 *                           linked_user_email:
 *                             type: string
 *                           linked_user_name:
 *                             type: string
 *                           total_accesses:
 *                             type: integer
 *                           last_access:
 *                             type: string
 *                           data_types_accessed:
 *                             type: array
 *                             items:
 *                               type: string
 *                           access_frequency:
 *                             type: object
 *                             properties:
 *                               daily:
 *                                 type: integer
 *                               weekly:
 *                                 type: integer
 *                               monthly:
 *                                 type: integer
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_linked_accounts:
 *                           type: integer
 *                         total_access_events:
 *                           type: integer
 *                         successful_accesses:
 *                           type: integer
 *                         failed_accesses:
 *                           type: integer
 *       401:
 *         description: Unauthorized — invalid or missing token
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

    const pool = DatabasePool.getInstance()

    // Get all linked accounts for this user
    const linkedAccountsQuery = `
      SELECT 
        la.id,
        la.linked_user_id,
        la.linked_email as linked_user_email,
        la.relationship_type,
        la.permissions,
        la.created_at as linked_since,
        COALESCE(u.first_name || ' ' || u.last_name, la.linked_email) as linked_user_name
      FROM linked_accounts la
      LEFT JOIN users u ON la.linked_user_id = u.id
      WHERE la.user_id = $1 AND la.is_active = true
      ORDER BY la.created_at DESC
    `
    const linkedAccountsResult = await pool.query(linkedAccountsQuery, [user.id])

    // Get access logs for each linked account
    const accessLogsQuery = `
      SELECT 
        aal.id,
        aal.requesting_user_email,
        aal.linked_account_id,
        aal.data_type,
        aal.permission_used,
        aal.access_granted,
        aal.error_message,
        aal.created_at,
        la.linked_email as linked_user_email,
        COALESCE(u.first_name || ' ' || u.last_name, la.linked_email) as linked_user_name
      FROM account_access_logs aal
      JOIN linked_accounts la ON aal.linked_account_id = la.id
      LEFT JOIN users u ON la.linked_user_id = u.id
      WHERE la.user_id = $1
      ORDER BY aal.created_at DESC
      LIMIT 1000
    `
    const accessLogsResult = await pool.query(accessLogsQuery, [user.id])

    // Calculate access statistics for each linked account
    const accessStats: AccessStats[] = []
    
    for (const linkedAccount of linkedAccountsResult.rows) {
      const accountLogs = accessLogsResult.rows.filter(log => 
        log.linked_account_id === linkedAccount.id
      )

      if (accountLogs.length > 0) {
        const now = new Date()
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        const dailyAccesses = accountLogs.filter(log => 
          new Date(log.created_at) > oneDayAgo && log.access_granted
        ).length

        const weeklyAccesses = accountLogs.filter(log => 
          new Date(log.created_at) > oneWeekAgo && log.access_granted
        ).length

        const monthlyAccesses = accountLogs.filter(log => 
          new Date(log.created_at) > oneMonthAgo && log.access_granted
        ).length

        const dataTypesAccessed = [...new Set(
          accountLogs
            .filter(log => log.access_granted)
            .map(log => log.data_type)
        )]

        const lastAccess = accountLogs
          .filter(log => log.access_granted)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

        accessStats.push({
          linked_account_id: linkedAccount.id,
          linked_user_email: linkedAccount.linked_user_email,
          linked_user_name: linkedAccount.linked_user_name,
          total_accesses: accountLogs.filter(log => log.access_granted).length,
          last_access: lastAccess ? lastAccess.created_at : 'Never',
          data_types_accessed: dataTypesAccessed,
          access_frequency: {
            daily: dailyAccesses,
            weekly: weeklyAccesses,
            monthly: monthlyAccesses
          }
        })
      } else {
        accessStats.push({
          linked_account_id: linkedAccount.id,
          linked_user_email: linkedAccount.linked_user_email,
          linked_user_name: linkedAccount.linked_user_name,
          total_accesses: 0,
          last_access: 'Never',
          data_types_accessed: [],
          access_frequency: {
            daily: 0,
            weekly: 0,
            monthly: 0
          }
        })
      }
    }

    // Format access logs
    const formattedAccessLogs: AccessLogEntry[] = accessLogsResult.rows.map(log => ({
      id: log.id,
      requesting_user_email: log.requesting_user_email,
      linked_account_id: log.linked_account_id,
      data_type: log.data_type,
      permission_used: log.permission_used,
      access_granted: log.access_granted,
      error_message: log.error_message,
      created_at: log.created_at,
      linked_user_name: log.linked_user_name,
      linked_user_email: log.linked_user_email
    }))

    return res.status(200).json({
      success: true,
      data: {
        linked_accounts: linkedAccountsResult.rows,
        access_logs: formattedAccessLogs,
        access_stats: accessStats,
        summary: {
          total_linked_accounts: linkedAccountsResult.rows.length,
          total_access_events: accessLogsResult.rows.length,
          successful_accesses: accessLogsResult.rows.filter(log => log.access_granted).length,
          failed_accesses: accessLogsResult.rows.filter(log => !log.access_granted).length
        }
      }
    })

  } catch (error) {
    console.error('❌ Error fetching access history:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}