import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

/**
 * @openapi
 * /api/memory/list:
 *   get:
 *     summary: Get list of user memories
 *     description: Returns the list of memories for an authenticated user, ordered by importance and extraction date.
 *     tags:
 *       - Memory
 *     parameters:
 *       - in: query
 *         name: sessionToken
 *         schema:
 *           type: string
 *         required: true
 *         description: Session token for user authentication
 *     responses:
 *       200:
 *         description: A list of user memories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 memories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       memoryType:
 *                         type: string
 *                       summary:
 *                         type: string
 *                       details:
 *                         type: object
 *                       confidence:
 *                         type: number
 *                       importance:
 *                         type: number
 *                       relatedSymptoms:
 *                         type: array
 *                         items:
 *                           type: string
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: string
 *                       extractedAt:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Missing session token
 *       401:
 *         description: Invalid session token
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Server error
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { sessionToken } = req.query

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token required' })
    }

    // Validate session token and get user info
    const validateResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
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

    // Get user's memories
    const client = await DatabasePool.getClient()
    try {
      const result = await client.query(`
        SELECT 
          id,
          memory_type as "memoryType",
          summary,
          details,
          confidence,
          importance,
          related_symptoms as "relatedSymptoms",
          tags,
          extracted_at as "extractedAt",
          created_at as "createdAt"
        FROM chat_memory 
        WHERE user_id = $1 
        ORDER BY importance DESC, extracted_at DESC
      `, [user.id])

      const memories = result.rows.map(row => ({
        ...row,
        details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
        relatedSymptoms: row.relatedSymptoms || [],
        tags: row.tags || []
      }))

      return res.status(200).json({
        success: true,
        memories,
        count: memories.length
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('❌ Error in memory list API:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch memories',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}