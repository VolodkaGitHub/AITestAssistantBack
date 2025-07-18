import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

interface Condition {
  id: string
  display_name: string
  source_links: string[]
}

interface ConditionsResponse {
  conditions: Condition[]
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Auto-sync conditions if not already cached
    const syncResponse = await fetch(`${req.headers.origin || 'http://localhost:5000'}/api/conditions/sync`, {
      method: 'POST'
    })

    // Fetch conditions from local database
    const result = await dbPool.query(
      'SELECT id, display_name, source_links FROM conditions_library ORDER BY display_name ASC'
    )

    const conditions: Condition[] = result.rows.map(row => ({
      id: row.id,
      display_name: row.display_name,
      source_links: typeof row.source_links === 'string' ? JSON.parse(row.source_links) : (row.source_links || [])
    }))

    const response: ConditionsResponse = {
      conditions
    }
    
    return res.status(200).json(response)
  } catch (error) {
    console.error('Error fetching conditions:', error)
    return res.status(500).json({ 
      error: 'Internal server error while fetching conditions' 
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}