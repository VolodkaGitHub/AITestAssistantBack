import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { getHealthContextForUser } from '../../lib/health-context'

/**
 * @openapi
 * /api/health/context:
 *   post:
 *     tags:
 *       - Health
 *     summary: Get general health context for a user
 *     description: Returns user-specific health context information.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 example: "user_123"
 *     responses:
 *       200:
 *         description: Successful response with health context
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 context:
 *                   type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Missing userId
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "userId is required"
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Server error
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    // Get health context
    const context = await getHealthContextForUser(userId)

    res.status(200).json({ 
      success: true, 
      context,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching health context:', error)
    res.status(500).json({ 
      error: 'Failed to fetch health context',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}