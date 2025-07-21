import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { DatabasePool } from '../../lib/database-pool';

/**
 * Clear Wearables Cache API
 * Clears both database records and instructs frontend to clear localStorage
 */

/**
 * @openapi
 * /api/wearables/clear-cache:
 *   post:
 *     tags:
 *       - Wearables
 *     summary: Clear user's wearable cache
 *     description: Clears wearable-related data from the database and instructs the frontend to clear localStorage.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wearable cache cleared successfully
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
 *                   example: Wearable cache cleared successfully
 *                 action:
 *                   type: string
 *                   example: clear_frontend_cache
 *                 cleared_tables:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - wearable_connections
 *                     - wearable_health_data
 *                     - terra_webhook_events
 *                     - terra_data_sync
 *       401:
 *         description: Authorization required or invalid session token
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Failed to clear cache due to server error
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate session
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' })
    }

    const sessionToken = authHeader.substring(7)
    const user = await validateSessionToken(sessionToken)
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    // Force clear all wearable data for this user from database
    const client = await DatabasePool.getClient()
    
    try {
      await client.query('DELETE FROM wearable_connections WHERE user_id = $1', [user.id])
      await client.query('DELETE FROM wearable_health_data WHERE user_id = $1', [user.id])
      await client.query('DELETE FROM terra_webhook_events WHERE user_id = $1', [user.id])
      await client.query('DELETE FROM terra_data_sync WHERE user_id = $1', [user.id])
    } finally {
      client.release()
    }

    return res.status(200).json({
      success: true,
      message: 'Wearable cache cleared successfully',
      action: 'clear_frontend_cache',
      cleared_tables: ['wearable_connections', 'wearable_health_data', 'terra_webhook_events', 'terra_data_sync']
    })

  } catch (error) {
    console.error('Error clearing wearables cache:', error)
    return res.status(500).json({ error: 'Failed to clear cache' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}