import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'

/**
 * @openapi
 * /api/admin/metrics:
 *   get:
 *     summary: Fetch real-time admin system metrics
 *     description: Returns token usage, session data, and average response times for the current day using authenticated queries.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin system metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: number
 *                 activeUsers:
 *                   type: number
 *                 totalSessions:
 *                   type: number
 *                 activeSessions:
 *                   type: number
 *                 totalTokensToday:
 *                   type: number
 *                 totalCostToday:
 *                   type: number
 *                 averageSessionDuration:
 *                   type: number
 *                 errorRate:
 *                   type: number
 *                 apiResponseTimes:
 *                   type: object
 *                   additionalProperties:
 *                     type: number
 *                 totalApiCallsToday:
 *                   type: number
 *                 lastUpdated:
 *                   type: string
 *                 dataSource:
 *                   type: string
 *       401:
 *         description: Unauthorized - Admin access required
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Failed to retrieve system metrics
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Simple admin authentication
  const authHeader = req.headers.authorization
  if (!authHeader || (!authHeader.includes('admin-key') && !authHeader.includes('Bearer admin-key'))) {
    return res.status(401).json({ error: 'Admin access required' })
  }

  try {
    // Query real database for authentic metrics from actual API usage
    const { DatabasePool } = require('../../lib/database-pool')

    const client = await DatabasePool.getClient()
    
    try {
      // Get real token usage from actual API calls
      const tokenStatsResult = await client.query(`
        SELECT 
          COUNT(DISTINCT user_id) as unique_users_today,
          COUNT(*) as total_api_calls_today,
          COALESCE(SUM(tokens_used), 0) as total_tokens_today,
          COALESCE(SUM(estimated_cost), 0) as total_cost_today,
          COALESCE(AVG(response_time_ms), 0) as avg_response_time
        FROM api_usage_logs
        WHERE created_at > CURRENT_DATE
      `)
      
      // Get session statistics from user_sessions table using correct schema
      const sessionStatsResult = await client.query(`
        SELECT 
          COUNT(DISTINCT user_id) as total_users,
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN last_accessed > NOW() - INTERVAL '1 hour' THEN 1 END) as active_sessions,
          AVG(EXTRACT(epoch FROM (last_accessed - created_at))/60) as avg_duration_minutes
        FROM user_sessions
        WHERE created_at > CURRENT_DATE
      `)

      // Get API response times by type from real calls
      const responseTimesResult = await client.query(`
        SELECT 
          api_type,
          AVG(response_time_ms) as avg_response_time
        FROM api_usage_logs 
        WHERE created_at > CURRENT_DATE
        GROUP BY api_type
      `)

      const tokenStats = tokenStatsResult.rows[0] || {}
      const sessionStats = sessionStatsResult.rows[0] || {}
      
      // Process response times by API type
      const responseTimesByAPI: Record<string, number> = {}
      responseTimesResult.rows.forEach((row: any) => {
        responseTimesByAPI[row.api_type] = Math.round(parseFloat(row.avg_response_time) || 0)
      })

      // Build metrics from real database data
      const systemMetrics = {
        totalUsers: parseInt(sessionStats.total_users) || 0,
        activeUsers: parseInt(tokenStats.unique_users_today) || 0,
        totalSessions: parseInt(sessionStats.total_sessions) || 0,
        activeSessions: parseInt(sessionStats.active_sessions) || 0,
        totalTokensToday: parseInt(tokenStats.total_tokens_today) || 0,
        totalCostToday: parseFloat(tokenStats.total_cost_today) || 0,
        averageSessionDuration: parseFloat(sessionStats.avg_duration_minutes) || 0,
        errorRate: 0, // Can be enhanced to check status_code >= 400
        apiResponseTimes: {
          openai: responseTimesByAPI.openai || 0,
          merlin: responseTimesByAPI.merlin || 0,
          terra: responseTimesByAPI.terra || 0
        },
        totalApiCallsToday: parseInt(tokenStats.total_api_calls_today) || 0,
        lastUpdated: new Date().toISOString(),
        dataSource: 'authentic' // Flag to indicate real data
      }

      res.status(200).json(systemMetrics)

    } finally {
      client.release()
      // Database connection managed by pool - no need to end here
    }
  } catch (error) {
    console.error('Admin metrics error:', error)
    res.status(500).json({ 
      error: 'Failed to fetch admin metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}