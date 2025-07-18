import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';


/**
 * @openapi
 * /api/admin/database-status:
 *   get:
 *     summary: Check database connectivity
 *     description: Performs a basic connectivity test to the PostgreSQL database and returns a timestamp.
 *     tags:
 *       - Admin
 *     responses:
 *       200:
 *         description: Database connection is successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connected:
 *                   type: boolean
 *                 database:
 *                   type: string
 *                 testQuery:
 *                   type: object
 *                   properties:
 *                     test:
 *                       type: number
 *                     timestamp:
 *                       type: string
 *                 timestamp:
 *                   type: string
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Database connection failed
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const client = await DatabasePool.getClient()
    
    try {
      // Simple connectivity test using the client's query method
      const result = await client.query('SELECT 1 as test, NOW() as timestamp')
    
      return res.status(200).json({
        connected: true,
        database: 'PostgreSQL',
        testQuery: result.rows[0],
        timestamp: new Date().toISOString()
      })
    } finally {
      client.release()
    }
    
  } catch (error) {
    console.error('Database status check failed:', error)
    return res.status(500).json({
      connected: false,
      error: error instanceof Error ? error.message : 'Database connection failed',
      timestamp: new Date().toISOString()
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}