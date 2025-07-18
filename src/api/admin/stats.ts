import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'
import { DatabasePool } from '../../lib/database-pool'

/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     summary: Fetch authentication and user statistics
 *     description: Provides OTP usage, verification attempts, recent signups, and active session statistics for admin overview.
 *     tags:
 *       - Admin
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: object
 *                     activeSessions:
 *                       type: number
 *                     otp:
 *                       type: object
 *                       properties:
 *                         total_otps_sent:
 *                           type: number
 *                         otps_used:
 *                           type: number
 *                         otps_24h:
 *                           type: number
 *                     attempts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           attempt_type:
 *                             type: string
 *                           count:
 *                             type: number
 *                           successful:
 *                             type: number
 *                     recentUsers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           first_name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                           is_verified:
 *                             type: boolean
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
    await authDB.initializeSchema()
    
    // Get user statistics
    const userStats = await authDB.getUserStats()
    
    // Get additional statistics
    const client = await DatabasePool.getClient()
    try {
      // Get active sessions count
      const activeSessionsQuery = `
        SELECT COUNT(*) as active_sessions
        FROM user_sessions 
        WHERE expires_at > CURRENT_TIMESTAMP AND is_active = true
      `
      const activeSessionsResult = await client.query(activeSessionsQuery)
      
      // Get OTP statistics
      const otpStatsQuery = `
        SELECT 
          COUNT(*) as total_otps_sent,
          COUNT(CASE WHEN is_used = true THEN 1 END) as otps_used,
          COUNT(CASE WHEN created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 1 END) as otps_24h
        FROM otp_codes
      `
      const otpStatsResult = await client.query(otpStatsQuery)
      
      // Get verification attempts by type
      const attemptsQuery = `
        SELECT 
          attempt_type,
          COUNT(*) as count,
          COUNT(CASE WHEN is_successful = true THEN 1 END) as successful
        FROM verification_attempts
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
        GROUP BY attempt_type
      `
      const attemptsResult = await client.query(attemptsQuery)
      
      // Get recent user signups
      const recentUsersQuery = `
        SELECT 
          first_name,
          last_name,
          email,
          created_at,
          is_verified
        FROM users
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 10
      `
      const recentUsersResult = await client.query(recentUsersQuery)

      res.status(200).json({
        success: true,
        statistics: {
          users: userStats,
          activeSessions: parseInt(activeSessionsResult.rows[0].active_sessions),
          otp: otpStatsResult.rows[0],
          attempts: attemptsResult.rows,
          recentUsers: recentUsersResult.rows
        }
      })
      
    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Admin stats error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}