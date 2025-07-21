import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import { validateSessionToken } from '../../lib/auth-database'

/**
 * Health Timeline Mention API
 * Returns formatted health timeline data for @mention functionality
 */

/**
 * @openapi
 * /api/mention/timeline:
 *   get:
 *     summary: Retrieve user health timeline for mention
 *     description: Returns formatted health timeline data for @mention functionality.
 *     tags:
 *       - Mention
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved health timeline data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: string
 *                   description: Summary description of health timeline entries
 *                   example: "5 health timeline entries, 3 recent (last 30 days), Recent symptoms: fever, cough, fatigue"
 *                 data:
 *                   type: object
 *                   properties:
 *                     timeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           date:
 *                             type: string
 *                             format: date
 *                           symptoms:
 *                             type: array
 *                             items:
 *                               type: string
 *                           findings:
 *                             type: string
 *                           top_differential_diagnoses:
 *                             type: string
 *                           chat_summary:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                     recent:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/HealthTimelineEntry'
 *                     total_count:
 *                       type: integer
 *                       description: Total number of timeline entries
 *                     recent_count:
 *                       type: integer
 *                       description: Number of recent timeline entries (last 30 days)
 *                     last_entry_date:
 *                       type: string
 *                       format: date
 *                       nullable: true
 *                       description: Date of the most recent timeline entry
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Timestamp of the response generation
 *       401:
 *         description: Unauthorized - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authorization token required"
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 * components:
 *   schemas:
 *     HealthTimelineEntry:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         date:
 *           type: string
 *           format: date
 *         symptoms:
 *           type: array
 *           items:
 *             type: string
 *         findings:
 *           type: string
 *         top_differential_diagnoses:
 *           type: string
 *         chat_summary:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
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
      // Fetch user health timeline
      const query = `
        SELECT 
          id,
          date,
          symptoms,
          findings,
          top_differential_diagnoses,
          chat_summary,
          created_at,
          updated_at
        FROM health_timeline 
        WHERE user_id = $1 
        ORDER BY date DESC, created_at DESC
        LIMIT 10
      `
      
      const result = await client.query(query, [user.id])
      const timeline = result.rows

      // Get recent timeline entries (last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const recentEntries = timeline.filter(entry => {
        const entryDate = new Date(entry.date)
        return entryDate >= thirtyDaysAgo
      })

      // Format summary for mention
      let summary = 'No health timeline entries recorded'
      if (timeline.length > 0) {
        const parts = [`${timeline.length} health timeline entries`]
        
        if (recentEntries.length > 0) {
          parts.push(`${recentEntries.length} recent (last 30 days)`)
        }
        
        // Get top symptoms from recent entries
        const recentSymptoms = recentEntries
          .flatMap(entry => {
            try {
              return typeof entry.symptoms === 'string' ? JSON.parse(entry.symptoms) : entry.symptoms || []
            } catch {
              return []
            }
          })
          .slice(0, 3)
        
        if (recentSymptoms.length > 0) {
          parts.push(`Recent symptoms: ${recentSymptoms.join(', ')}`)
        }
        
        summary = parts.join(', ')
      }

      return res.status(200).json({
        summary,
        data: {
          timeline,
          recent: recentEntries,
          total_count: timeline.length,
          recent_count: recentEntries.length,
          last_entry_date: timeline.length > 0 ? timeline[0].date : null
        },
        timestamp: new Date().toISOString()
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Health timeline mention API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}