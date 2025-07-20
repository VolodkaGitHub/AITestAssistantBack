import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { getAutomaticHealthContext } from '../../lib/automatic-health-context'

/**
 * @openapi
 * /api/health/automatic-context:
 *   post:
 *     summary: Get automatically generated health context
 *     description: Returns the automatic health context for a specific user by userId.
 *     tags:
 *       - Health
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
 *                 description: The ID of the user.
 *                 example: "user_abc123"
 *     responses:
 *       200:
 *         description: Successfully returned the health context.
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
 *                   description: The generated health context for the user.
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-07-20T09:30:00.000Z"
 *       400:
 *         description: userId is missing in the request body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "userId is required"
 *       405:
 *         description: Invalid request method.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Internal server error while fetching context.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch automatic health context"
 *                 details:
 *                   type: string
 *                   example: "Database connection failed"
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

    // Get automatic health context
    const context = await getAutomaticHealthContext(userId)

    res.status(200).json({ 
      success: true, 
      context,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching automatic health context:', error)
    res.status(500).json({ 
      error: 'Failed to fetch automatic health context',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}