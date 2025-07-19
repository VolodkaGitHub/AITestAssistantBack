import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { costTracker } from '../../lib/cost-tracker'

/**
 * @openapi
 * /api/cost/get-session-cost:
 *   get:
 *     summary: Get cost statistics by sessionId
 *     description: Returns input/output token counts, costs, and formatted total cost for a given session ID.
 *     tags:
 *       - Cost
 *     parameters:
 *       - in: query
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier of the session
 *     responses:
 *       200:
 *         description: Successful response with cost data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inputTokens:
 *                   type: integer
 *                   example: 100
 *                 outputTokens:
 *                   type: integer
 *                   example: 150
 *                 totalTokens:
 *                   type: integer
 *                   example: 250
 *                 inputCost:
 *                   type: number
 *                   format: float
 *                   example: 0.0025
 *                 outputCost:
 *                   type: number
 *                   format: float
 *                   example: 0.00375
 *                 totalCost:
 *                   type: number
 *                   format: float
 *                   example: 0.00625
 *                 callCount:
 *                   type: integer
 *                   example: 3
 *                 formattedCost:
 *                   type: string
 *                   example: "$0.0063"
 *       400:
 *         description: Bad request — missing or invalid sessionId
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Session ID is required"
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 */


function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { sessionId } = req.query

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Session ID is required' })
  }

  const costs = costTracker.getCosts(sessionId)
  
  if (!costs) {
    return res.status(200).json({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      callCount: 0,
      formattedCost: '$0.0000'
    })
  }

  return res.status(200).json({
    ...costs,
    formattedCost: costTracker.formatCost(costs.totalCost)
  })
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}