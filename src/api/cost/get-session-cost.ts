import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { costTracker } from '../../lib/cost-tracker'

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