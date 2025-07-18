// API endpoint for listing scheduled prompts
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'
import { AuthDatabase } from '../../lib/auth-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '')

    if (!sessionToken) {
      return res.status(401).json({ error: 'No session token provided' })
    }

    // Validate user session
    const authDb = new AuthDatabase()
    const userSession = await authDb.validateSessionToken(sessionToken)
    if (!userSession) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const client = await DatabasePool.getClient()

    // Get scheduled prompts for authenticated user
    const query = `
      SELECT 
        id,
        user_id,
        prompt_name as title,
        prompt_text,
        schedule_type,
        data_types as mentioned_data_types,
        email_delivery,
        is_active as active,
        created_at,
        updated_at,
        last_executed,
        next_execution,
        schedule_time,
        schedule_day
      FROM scheduled_prompts 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `

    const result = await client.query(query, [userSession.id])
    client.release()

    res.status(200).json({
      success: true,
      prompts: result.rows.map(row => ({
        ...row,
        mentioned_data_types: typeof row.mentioned_data_types === 'string' 
          ? JSON.parse(row.mentioned_data_types) 
          : row.mentioned_data_types
      })),
      total: result.rows.length
    })

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}