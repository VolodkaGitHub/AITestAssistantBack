import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import { validateSessionToken } from '../../lib/auth-database'

/**
 * Lab Results Mention API
 * Returns formatted lab results data for @mention functionality
 */


/**
 * @openapi
 * /api/mention/lab-results:
 *   get:
 *     tags:
 *       - Mention
 *     summary: Get user lab results for mention
 *     description: Returns a formatted list of user lab results to be used in @mention feature. Includes recent and abnormal results.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully returned lab results
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
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           test_name:
 *                             type: string
 *                           test_value:
 *                             type: string
 *                           normal_range:
 *                             type: string
 *                           unit:
 *                             type: string
 *                           status:
 *                             type: string
 *                           test_date:
 *                             type: string
 *                             format: date-time
 *                           ordering_doctor:
 *                             type: string
 *                           lab_name:
 *                             type: string
 *                           notes:
 *                             type: string
 *                           category:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                     recent:
 *                       type: array
 *                       description: Lab results from last 30 days
 *                       items:
 *                         $ref: '#/components/schemas/LabResult'
 *                     abnormal:
 *                       type: array
 *                       description: Lab results with abnormal status
 *                       items:
 *                         $ref: '#/components/schemas/LabResult'
 *                     total_count:
 *                       type: integer
 *                     recent_count:
 *                       type: integer
 *                     abnormal_count:
 *                       type: integer
 *                     last_test_date:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
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
 *   schemas:
 *     LabResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         test_name:
 *           type: string
 *         test_value:
 *           type: string
 *         normal_range:
 *           type: string
 *         unit:
 *           type: string
 *         status:
 *           type: string
 *         test_date:
 *           type: string
 *           format: date-time
 *         ordering_doctor:
 *           type: string
 *         lab_name:
 *           type: string
 *         notes:
 *           type: string
 *         category:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
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
      // Fetch user lab results
      const query = `
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
          created_at
        FROM user_lab_results 
        WHERE user_id = $1 
        ORDER BY test_date DESC, created_at DESC
        LIMIT 10
      `
      
      const result = await client.query(query, [user.id])
      const labResults = result.rows

      // Get recent and abnormal results
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const recentResults = labResults.filter(result => {
        const testDate = new Date(result.test_date)
        return testDate >= thirtyDaysAgo
      })

      const abnormalResults = labResults.filter(result => 
        result.status && result.status.toLowerCase() !== 'normal'
      )

      // Format summary for mention
      let summary = 'No lab results recorded'
      if (labResults.length > 0) {
        const parts = [`${labResults.length} total lab results`]
        
        if (recentResults.length > 0) {
          parts.push(`${recentResults.length} recent (last 30 days)`)
        }
        
        if (abnormalResults.length > 0) {
          parts.push(`${abnormalResults.length} abnormal values`)
          const abnormalNames = abnormalResults.slice(0, 2).map(r => r.test_name)
          parts.push(`including: ${abnormalNames.join(', ')}`)
        }
        
        summary = parts.join(', ')
      }

      return res.status(200).json({
        summary,
        data: {
          results: labResults,
          recent: recentResults,
          abnormal: abnormalResults,
          total_count: labResults.length,
          recent_count: recentResults.length,
          abnormal_count: abnormalResults.length,
          last_test_date: labResults.length > 0 ? labResults[0].test_date : null
        },
        timestamp: new Date().toISOString()
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Lab results mention API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}