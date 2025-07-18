import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { sessionToken, memoryId } = req.body

    if (!sessionToken || !memoryId) {
      return res.status(400).json({ error: 'Session token and memory ID required' })
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

    // Delete memory (only allow users to delete their own memories)
    const client = await DatabasePool.getClient()
    try {
      const result = await client.query(`
        DELETE FROM chat_memory 
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `, [memoryId, user.id])

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Memory not found or access denied' })
      }

      return res.status(200).json({
        success: true,
        message: 'Memory deleted successfully'
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('❌ Error in memory delete API:', error)
    return res.status(500).json({ 
      error: 'Failed to delete memory',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}