import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { getAutomaticHealthContext } from '../../lib/automatic-health-context'

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