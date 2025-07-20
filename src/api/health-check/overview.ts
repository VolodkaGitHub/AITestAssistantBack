import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

/**
 * @openapi
 * /api/health-check/overview:
 *   get:
 *     summary: Get health overview for authenticated user
 *     description: >
 *       Returns a summary of the user's health data including current medications,
 *       wearable device connections, and recent health timeline events.
 *     tags:
 *       - HealthCheck
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Health overview retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 healthData:
 *                   type: object
 *                   properties:
 *                     medications:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                           example: 3
 *                         current:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "Aspirin"
 *                               dosage:
 *                                 type: string
 *                                 example: "100mg"
 *                               frequency:
 *                                 type: string
 *                                 example: "Once a day"
 *                               is_active:
 *                                 type: boolean
 *                                 example: true
 *                               startDate:
 *                                 type: string
 *                                 format: date
 *                                 example: "2023-01-01"
 *                     wearables:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                           example: 2
 *                         connections:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               provider:
 *                                 type: string
 *                                 example: "Fitbit"
 *                               status:
 *                                 type: string
 *                                 example: "connected"
 *                               lastSync:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2025-07-20T10:00:00Z"
 *                               connectedAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2025-06-01T09:30:00Z"
 *                               is_active:
 *                                 type: boolean
 *                                 example: true
 *                     timeline:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                           example: 10
 *                         recent:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                                 example: "session_id"
 *                               summary:
 *                                 type: string
 *                                 example: "Patient reported mild headache"
 *                               date:
 *                                 type: string
 *                                 format: date
 *                                 example: "2025-07-19"
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2025-07-19T12:00:00Z"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-07-20T12:00:00Z"
 *       '401':
 *         description: Unauthorized - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authorization token required"
 *       '405':
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve health overview"
 *                 details:
 *                   type: string
 *                   example: "Database connection error"
 */


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' })
    }

    const sessionToken = authHeader.replace('Bearer ', '')

    // Validate session and get user ID
    const validateResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionToken })
    })

    if (!validateResponse.ok) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const { user } = await validateResponse.json()
    const userId = user.id

    const client = await DatabasePool.getClient()

    try {
      // Get medications using correct column names
      const medicationsResult = await client.query(`
        SELECT name, dosage, frequency, status, start_date
        FROM user_medications 
        WHERE user_id = $1 
        ORDER BY start_date DESC
      `, [userId])

      // Lab results removed per user request

      // Get wearables connections using correct column names
      const wearablesResult = await client.query(`
        SELECT provider, status, last_sync, connected_at
        FROM wearable_connections
        WHERE user_id = $1
      `, [userId])

      // Get health timeline events using correct column names
      const timelineResult = await client.query(`
        SELECT session_id as event_type, chat_summary as summary, date as event_date, created_at
        FROM health_timeline
        WHERE user_id = $1
        ORDER BY date DESC
      `, [userId])

      const healthData = {
        medications: {
          total_count: medicationsResult.rows.length,
          current: medicationsResult.rows.map(row => ({
            name: row.name,
            dosage: row.dosage,
            frequency: row.frequency,
            is_active: row.status === 'active',
            startDate: row.start_date
          }))
        },
        wearables: {
          total_count: wearablesResult.rows.length,
          connections: wearablesResult.rows.map(row => ({
            provider: row.provider,
            status: row.status,
            lastSync: row.last_sync,
            connectedAt: row.connected_at,
            is_active: row.is_active === true || row.status === 'connected'
          }))
        },
        timeline: {
          total_count: timelineResult.rows.length,
          recent: timelineResult.rows.slice(0, 5).map(row => ({
            type: row.event_type,
            summary: row.summary,
            date: row.event_date,
            createdAt: row.created_at
          }))
        }
      }

      return res.status(200).json({
        success: true,
        healthData,
        timestamp: new Date().toISOString()
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Health check overview error:', error)
    return res.status(500).json({
      error: 'Failed to retrieve health overview',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}