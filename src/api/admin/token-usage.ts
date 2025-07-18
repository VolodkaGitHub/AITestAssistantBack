import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'

/**
 * @openapi
 * /api/admin/token-usage:
 *   get:
 *     summary: Retrieve token usage and cost metrics
 *     description: Returns recent API call logs with token usage, estimated cost, response time, and status across sessions. Query param `timeRange` selects time window.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: timeRange
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *           default: 24h
 *         description: Time range for token usage summary
 *     responses:
 *       200:
 *         description: Token usage logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   userId:
 *                     type: string
 *                   sessionId:
 *                     type: string
 *                   apiType:
 *                     type: string
 *                   endpoint:
 *                     type: string
 *                   tokensUsed:
 *                     type: number
 *                   estimatedCost:
 *                     type: number
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                   responseTime:
 *                     type: number
 *                   status:
 *                     type: string
 *                     enum: [success, error]
 *       401:
 *         description: Unauthorized - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: Failed to fetch token usage data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
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
    // Query real database for authentic token usage data
    const { DatabasePool } = require('../../../lib/database-pool')

    const { timeRange = '24h' } = req.query
    let intervalClause = 'INTERVAL \'24 hours\''
    switch (timeRange) {
      case '1h':
        intervalClause = 'INTERVAL \'1 hour\''
        break
      case '7d':
        intervalClause = 'INTERVAL \'7 days\''
        break
      case '30d':
        intervalClause = 'INTERVAL \'30 days\''
        break
    }

    const client = await DatabasePool.getClient()
    
    try {
      const tokenUsageQuery = await client.query(`
        SELECT 
          user_id,
          session_id,
          api_type,
          endpoint,
          tokens_used,
          estimated_cost,
          response_time_ms,
          status_code,
          created_at,
          CASE 
            WHEN status_code >= 400 THEN 'error'
            ELSE 'success'
          END as status
        FROM api_usage_logs 
        WHERE created_at > NOW() - ${intervalClause}
        ORDER BY created_at DESC
        LIMIT 1000
      `)

      const tokenUsage = tokenUsageQuery.rows.map((row: any) => ({
        userId: row.user_id || 'unknown',
        sessionId: row.session_id || 'unknown',
        apiType: row.api_type,
        endpoint: row.endpoint,
        tokensUsed: parseInt(row.tokens_used) || 0,
        estimatedCost: parseFloat(row.estimated_cost) || 0,
        timestamp: row.created_at,
        responseTime: parseInt(row.response_time_ms) || 0,
        status: row.status
      }))

      res.status(200).json(tokenUsage)

    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Token usage fetch error:', error)
    res.status(500).json({ error: 'Failed to fetch token usage' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}