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

/**
 * @openapi
 * /api/conditions/list:
 *   get:
 *     summary: Get all available conditions
 *     description: Returns a list of conditions from the local database. Triggers a sync with external source before returning results.
 *     tags:
 *       - Conditions
 *     responses:
 *       200:
 *         description: List of conditions returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conditions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "condition_abc123"
 *                       display_name:
 *                         type: string
 *                         example: "Diabetes"
 *                       source_links:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["https://who.int/diabetes", "https://cdc.gov/diabetes"]
 *       405:
 *         description: Method Not Allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error while fetching conditions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error while fetching conditions
 */

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