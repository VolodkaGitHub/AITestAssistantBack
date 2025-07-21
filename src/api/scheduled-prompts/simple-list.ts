// API endpoint for listing scheduled prompts
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'
import { AuthDatabase } from '../../lib/auth-database'

/**
 * @openapi
 * /api/scheduled-prompts/simple-list:
 *   get:
 *     tags:
 *       - ScheduledPrompts
 *     summary: List all scheduled prompts for the authenticated user
 *     description: Returns all scheduled prompts belonging to the authenticated user, including scheduling details and metadata.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of scheduled prompts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total:
 *                   type: integer
 *                   example: 3
 *                 prompts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "1234abcd"
 *                       user_id:
 *                         type: string
 *                         example: "user-5678"
 *                       title:
 *                         type: string
 *                         example: "Weekly Health Summary"
 *                       prompt_text:
 *                         type: string
 *                         example: "Analyze my weekly health data and provide insights."
 *                       schedule_type:
 *                         type: string
 *                         example: "weekly"
 *                       mentioned_data_types:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["vitals", "lab_results"]
 *                       email_delivery:
 *                         type: boolean
 *                         example: false
 *                       active:
 *                         type: boolean
 *                         example: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-07-21T14:48:00Z"
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-07-22T09:30:00Z"
 *                       last_executed:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: "2025-07-20T07:00:00Z"
 *                       next_execution:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: "2025-07-27T07:00:00Z"
 *                       schedule_time:
 *                         type: string
 *                         nullable: true
 *                         example: "07:00:00"
 *                       schedule_day:
 *                         type: string
 *                         nullable: true
 *                         example: "Monday"
 *       401:
 *         description: Unauthorized due to missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid session token"
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Internal server error while fetching prompts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database connection failed"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-07-21T14:48:00Z"
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '')

    if (!sessionToken) {
      return res.status(401).json({ error: 'No session token provided' })
    }

    // Validate user session
    const authDb = new AuthDatabase()
    const userSession = await authDb.validateSessionToken(sessionToken)
    if (!userSession) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const client = await DatabasePool.getClient()

    // Get scheduled prompts for authenticated user
    const query = `
      SELECT 
        id,
        user_id,
        prompt_name as title,
        prompt_text,
        schedule_type,
        data_types as mentioned_data_types,
        email_delivery,
        is_active as active,
        created_at,
        updated_at,
        last_executed,
        next_execution,
        schedule_time,
        schedule_day
      FROM scheduled_prompts 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `

    const result = await client.query(query, [userSession.id])
    client.release()

    res.status(200).json({
      success: true,
      prompts: result.rows.map(row => ({
        ...row,
        mentioned_data_types: typeof row.mentioned_data_types === 'string' 
          ? JSON.parse(row.mentioned_data_types) 
          : row.mentioned_data_types
      })),
      total: result.rows.length
    })

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}