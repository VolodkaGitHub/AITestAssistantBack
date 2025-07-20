import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

/**
 * @openapi
 * /api/health/lab-results:
 *   get:
 *     tags:
 *       - Health
 *     summary: Get user lab results with summary
 *     description: Fetches up to 50 latest lab results for the authenticated user, including a summary of recent and abnormal results.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lab results fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       test_name:
 *                         type: string
 *                       test_value:
 *                         type: string
 *                       normal_range:
 *                         type: string
 *                       unit:
 *                         type: string
 *                       status:
 *                         type: string
 *                       test_date:
 *                         type: string
 *                         format: date
 *                       ordering_doctor:
 *                         type: string
 *                       lab_name:
 *                         type: string
 *                       notes:
 *                         type: string
 *                       category:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     recent:
 *                       type: integer
 *                     abnormal:
 *                       type: integer
 *                     lastTestDate:
 *                       type: string
 *                       format: date
 *                       nullable: true
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized or invalid session token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Server error fetching lab results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Extract user from session token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const sessionToken = authHeader.split(' ')[1]
    
    // Get user from session
    const userQuery = 'SELECT user_id FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()'
    const userResult = await dbPool.query(userQuery, [sessionToken])
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const userId = userResult.rows[0].user_id

    // Fetch lab results for the user
    const labResultsQuery = `
      SELECT 
        id,
        test_name,
        test_value,
        normal_range,
        unit,
        status,
        test_date,
        ordering_doctor,
        lab_name,
        notes,
        category,
        created_at,
        updated_at
      FROM user_lab_results 
      WHERE user_id = $1 
      ORDER BY test_date DESC, created_at DESC
      LIMIT 50
    `
    
    const labResultsResult = await dbPool.query(labResultsQuery, [userId])

    // Get lab results summary
    const recentResults = labResultsResult.rows.filter(result => {
      const testDate = new Date(result.test_date)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return testDate >= thirtyDaysAgo
    })

    const abnormalResults = labResultsResult.rows.filter(result => 
      result.status && result.status.toLowerCase() !== 'normal'
    )

    res.status(200).json({
      success: true,
      results: labResultsResult.rows,
      summary: {
        total: labResultsResult.rows.length,
        recent: recentResults.length,
        abnormal: abnormalResults.length,
        lastTestDate: labResultsResult.rows.length > 0 ? labResultsResult.rows[0].test_date : null
      },
      lastUpdated: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching lab results:', error)
    res.status(500).json({ 
      error: 'Failed to fetch lab results',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}