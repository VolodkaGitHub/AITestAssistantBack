import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { VectorSearchManager } from '../../lib/vector-search-manager'

/**
 * @openapi
 * /api/vector/initialize:
 *   post:
 *     tags:
 *       - Vector
 *     summary: Initialize the vector search database
 *     description: Ensures that the vector search database is ready for operations and returns current database stats.
 *     responses:
 *       200:
 *         description: Vector search database initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Vector search database initialized successfully
 *                 stats:
 *                   type: object
 *                   properties:
 *                     documentCount:
 *                       type: number
 *                       example: 42
 *                     isReady:
 *                       type: boolean
 *                       example: true
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
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
 *                   example: Internal server error during initialization
 *                 details:
 *                   type: string
 *                   example: DATABASE_URL environment variable not set
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      return res.status(500).json({ 
        error: 'Database configuration missing',
        details: 'DATABASE_URL environment variable not set'
      })
    }

    const vectorManager = new VectorSearchManager(databaseUrl)
    
    console.log('Initializing vector search database...')
    const isReady = await vectorManager.ensureVectorSearchReady()
    
    if (isReady) {
      const stats = await vectorManager.getDatabaseStats()
      
      return res.status(200).json({
        success: true,
        message: 'Vector search database initialized successfully',
        stats: {
          documentCount: stats.documentCount,
          isReady: stats.isReady
        }
      })
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize vector search database'
      })
    }
  } catch (error) {
    console.error('Vector search initialization error:', error)
    return res.status(500).json({
      success: false,
      error: 'Internal server error during initialization',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}