import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

/**
 * @deprecated This endpoint is deprecated. Use /api/terra/enrichment?type=daily instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 */

/**
 * @openapi
 * /api/health/daily-scores:
 *   get:
 *     tags:
 *       - Health
 *     summary: Get latest daily health scores
 *     description: Returns recent health scores (sleep, stress, respiratory) for the authenticated user.
 *     deprecated: true
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 7
 *         description: Number of records to retrieve
 *     responses:
 *       200:
 *         description: Successfully retrieved health scores
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 scores:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       sleepScore:
 *                         type: number
 *                       stressScore:
 *                         type: number
 *                       respiratoryScore:
 *                         type: number
 *                       contributors:
 *                         type: object
 *                         properties:
 *                           sleep:
 *                             type: string
 *                           stress:
 *                             type: string
 *                           respiratory:
 *                             type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized – missing or invalid token
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
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' })
    }

    const sessionToken = authHeader.replace('Bearer ', '')
    const { limit = '7' } = req.query

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
      // Get daily health scores
      const result = await client.query(`
        SELECT 
          score_date,
          sleep_score,
          stress_score,
          respiratory_score,
          sleep_contributors,
          stress_contributors,
          respiratory_contributors,
          created_at
        FROM daily_health_scores
        WHERE user_id = $1
        ORDER BY score_date DESC
        LIMIT $2
      `, [userId, parseInt(limit as string)])

      // Return scores as array (required by E2E test)
      const scores = result.rows.map(row => ({
        date: row.score_date,
        sleepScore: row.sleep_score,
        stressScore: row.stress_score,
        respiratoryScore: row.respiratory_score,
        contributors: {
          sleep: row.sleep_contributors,
          stress: row.stress_contributors,
          respiratory: row.respiratory_contributors
        },
        createdAt: row.created_at
      }))

      // E2E test expects response.data.scores array structure
      return res.status(200).json({
        success: true,
        scores, // E2E test looks for response.data.scores array
        count: scores.length,
        timestamp: new Date().toISOString()
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Get daily health scores error:', error)
    return res.status(500).json({
      error: 'Failed to retrieve daily health scores',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}