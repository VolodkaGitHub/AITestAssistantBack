import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import { ExtendedNextApiRequest, withScalableMiddleware } from '../../lib/api-middleware'

/**
 * @openapi
 * /api/admin/performance-stats:
 *   get:
 *     summary: Fetch real-time admin performance statistics
 *     description: Returns API usage metrics, database pool stats, rate limiting stats, and health indicators for administrative monitoring.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: string
 *                 database:
 *                   type: object
 *                   properties:
 *                     pool_stats:
 *                       type: object
 *                       properties:
 *                         totalConnections:
 *                           type: number
 *                         activeConnections:
 *                           type: number
 *                         idleConnections:
 *                           type: number
 *                     total_queries_today:
 *                       type: number
 *                     avg_response_time:
 *                       type: number
 *                     error_count:
 *                       type: number
 *                 api_performance:
 *                   type: object
 *                   properties:
 *                     avg_tokens_per_call:
 *                       type: number
 *                     breakdown_by_type:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           api_type:
 *                             type: string
 *                           call_count:
 *                             type: number
 *                           avg_response_time:
 *                             type: number
 *                           avg_tokens:
 *                             type: number
 *                           errors:
 *                             type: number
 *                 rate_limiting:
 *                   type: object
 *                   properties:
 *                     endpoints_with_violations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           endpoint:
 *                             type: string
 *                           requests:
 *                             type: number
 *                           violations:
 *                             type: number
 *                     total_violations_today:
 *                       type: number
 *                 health_indicators:
 *                   type: object
 *                   properties:
 *                     database_connection_health:
 *                       type: string
 *                     average_response_time_health:
 *                       type: string
 *                     error_rate_health:
 *                       type: string
 *       401:
 *         description: Unauthorized - Admin access required
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Failed to fetch performance statistics
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader || (!authHeader.includes('admin-key') && !authHeader.includes('Bearer admin-key'))) {
    return res.status(401).json({ error: 'Admin access required' })
  }

  try {
    // Get database pool statistics (simplified)
    const poolStats = {
      totalConnections: 50,
      activeConnections: 3,
      idleConnections: 47
    }
    
    // Get current API usage statistics
    const client = await DatabasePool.getClient()
    
    try {
      // Database performance metrics
      const dbMetricsQuery = await client.query(`
        SELECT 
          COUNT(*) as total_queries_today,
          AVG(tokens_used) as avg_tokens_per_call,
          AVG(response_time_ms) as avg_response_time,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
        FROM api_usage_logs 
        WHERE created_at > CURRENT_DATE
      `)
      
      // Performance breakdown by API type
      const apiBreakdownQuery = await client.query(`
        SELECT 
          api_type,
          COUNT(*) as call_count,
          AVG(response_time_ms) as avg_response_time,
          AVG(tokens_used) as avg_tokens,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors
        FROM api_usage_logs 
        WHERE created_at > CURRENT_DATE
        GROUP BY api_type
        ORDER BY call_count DESC
      `)

      // Rate limiting statistics
      const rateLimitQuery = await client.query(`
        SELECT 
          endpoint,
          COUNT(*) as requests,
          COUNT(CASE WHEN violation = true THEN 1 END) as violations
        FROM rate_limit_logs 
        WHERE created_at > CURRENT_DATE
        GROUP BY endpoint
        ORDER BY violations DESC
      `)

      // System health indicators
      const dbMetrics = dbMetricsQuery.rows[0]
      const apiBreakdown = apiBreakdownQuery.rows
      const rateLimitStats = rateLimitQuery.rows

      const performanceStats = {
        timestamp: new Date().toISOString(),
        database: {
          pool_stats: poolStats,
          total_queries_today: parseInt(dbMetrics.total_queries_today) || 0,
          avg_response_time: parseFloat(dbMetrics.avg_response_time) || 0,
          error_count: parseInt(dbMetrics.error_count) || 0
        },
        api_performance: {
          avg_tokens_per_call: parseFloat(dbMetrics.avg_tokens_per_call) || 0,
          breakdown_by_type: apiBreakdown.map(row => ({
            api_type: row.api_type,
            call_count: parseInt(row.call_count),
            avg_response_time: parseFloat(row.avg_response_time),
            avg_tokens: parseFloat(row.avg_tokens),
            errors: parseInt(row.errors)
          }))
        },
        rate_limiting: {
          endpoints_with_violations: rateLimitStats.filter(row => parseInt(row.violations) > 0),
          total_violations_today: rateLimitStats.reduce((sum, row) => sum + parseInt(row.violations || 0), 0)
        },
        health_indicators: {
          database_connection_health: poolStats.totalConnections < 45 ? 'healthy' : 'warning',
          average_response_time_health: parseFloat(dbMetrics.avg_response_time) < 2000 ? 'healthy' : 'warning',
          error_rate_health: parseInt(dbMetrics.error_count) < 5 ? 'healthy' : 'warning'
        }
      }

      res.status(200).json(performanceStats)

    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Performance stats fetch error:', error)
    res.status(500).json({ error: 'Failed to fetch performance statistics' })
  }
}

function expressAdapter(
  originalHandler: (req: ExtendedNextApiRequest, res: NextApiResponse) => Promise<void>
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response) => {
    const extendedReq = req as unknown as ExtendedNextApiRequest
    const extendedRes = res as unknown as NextApiResponse
    await originalHandler(extendedReq, extendedRes)
  }
}

export default expressAdapter(
  withScalableMiddleware('GENERAL_API', {
    requireSession: false,
    requireUserContext: false
  })(handler)
)