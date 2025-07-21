import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'

/**
 * @deprecated This endpoint is deprecated. Use /api/terra/connections?mode=simple instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 */

/**
 * @openapi
 * /api/terra/connections-simple:
 *   get:
 *     summary: Get user's wearable connections (deprecated)
 *     description: Deprecated. Use /api/terra/connections?mode=simple instead.
 *     tags:
 *       - Terra
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wearable connections retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 connections:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       provider:
 *                         type: string
 *                         example: "oura"
 *                       provider_display:
 *                         type: string
 *                         example: "OURA"
 *                       status:
 *                         type: string
 *                         example: "connected"
 *                       lastSync:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-07-21T12:34:56Z"
 *                       terraUserId:
 *                         type: string
 *                         example: "terra_user_123"
 *                       connectedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-07-20T10:00:00Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-07-21T12:00:00Z"
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       id:
 *                         type: string
 *                         example: "oura-connection"
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-07-21T13:00:00Z"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Authorization token required
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to retrieve wearables connections
 *                 details:
 *                   type: string
 *                   example: Detailed error message
 *
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
      // Get wearables connections using correct column names
      const result = await client.query(`
        SELECT 
          provider,
          status,
          last_sync,
          terra_user_id,
          connected_at,
          updated_at
        FROM wearable_connections
        WHERE user_id = $1
        ORDER BY connected_at DESC
      `, [userId])

      // Return response structure expected by E2E test and frontend
      const connections = result.rows.map(row => ({
        provider: row.provider,
        provider_display: row.provider.toUpperCase(),
        status: row.status,
        lastSync: row.last_sync,
        last_sync: row.last_sync,
        terraUserId: row.terra_user_id,
        terra_user_id: row.terra_user_id,
        connectedAt: row.connected_at,
        connected_at: row.connected_at,
        updatedAt: row.updated_at,
        is_active: row.status === 'connected' || row.status === 'active',
        id: `${row.provider}-${row.user_id || 'connection'}`
      }))

      return res.status(200).json({
        success: true,
        connections, // E2E test looks for response.data.connections array
        count: connections.length,
        timestamp: new Date().toISOString()
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Get wearables connections (simple) error:', error)
    return res.status(500).json({
      error: 'Failed to retrieve wearables connections',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}