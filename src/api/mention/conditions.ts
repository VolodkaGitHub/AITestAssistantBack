import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import { validateSessionToken } from '../../lib/auth-database'

/**
 * Conditions Mention API
 * Returns formatted medical conditions data for @mention functionality
 */

/**
 * @openapi
 * /api/mention/conditions:
 *   get:
 *     tags:
 *       - Mention
 *     summary: Get user conditions for mention
 *     description: Returns a formatted list of user conditions to be used in the @mention feature. Supports max 10 recent active conditions.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully returned conditions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     conditions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           condition_id:
 *                             type: string
 *                           date_added:
 *                             type: string
 *                             format: date-time
 *                           display_name:
 *                             type: string
 *                     total_count:
 *                       type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized (token missing or invalid)
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate authentication
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' })
    }

    const token = authHeader.split(' ')[1]
    const user = await validateSessionToken(token)
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const client = await DatabasePool.getClient()

    try {
      // Fetch user conditions with display names using correct schema
      const query = `
        SELECT 
          uc.condition_id,
          uc.created_at as date_added,
          cl.display_name
        FROM user_conditions uc
        LEFT JOIN conditions_library cl ON uc.condition_id = cl.id
        WHERE uc.user_id = $1 AND uc.is_active = true
        ORDER BY uc.created_at DESC
        LIMIT 10
      `
      
      const result = await client.query(query, [user.id])
      const conditions = result.rows

      // Format summary for mention
      let summary = 'No pre-existing conditions recorded'
      if (conditions.length > 0) {
        const conditionNames = conditions.slice(0, 3).map(cond => cond.display_name || cond.condition_id)
        
        if (conditions.length > 3) {
          summary = `${conditions.length} conditions including: ${conditionNames.join(', ')}`
        } else {
          summary = `${conditions.length} condition(s): ${conditionNames.join(', ')}`
        }
      }

      return res.status(200).json({
        summary,
        data: {
          conditions,
          total_count: conditions.length
        },
        timestamp: new Date().toISOString()
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Conditions mention API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}