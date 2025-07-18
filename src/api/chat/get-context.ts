import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { chatMemoryExtractor } from '../../lib/chat-memory-extractor'

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

    // Initialize schema if needed
    await chatMemoryExtractor.initializeSchema()

    // Get user's chat context
    const context = await chatMemoryExtractor.getUserChatContext(user.id)
    const contextualSummary = await chatMemoryExtractor.generateContextualSummary(user.id)

    return res.status(200).json({
      success: true,
      context,
      contextualSummary,
      hasMemory: contextualSummary.length > 0
    })

  } catch (error) {
    console.error('❌ Error in get-context API:', error)
    return res.status(500).json({ 
      error: 'Failed to get context',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}