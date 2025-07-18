import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import { MedicationsService } from '../../lib/medications-service'

const dbPool = DatabasePool.getInstance()

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Extract user from session token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const sessionToken = authHeader.split(' ')[1]
    
    // Get user from session
    const userQuery = 'SELECT user_id FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()'
    const userResult = await dbPool.query(userQuery, [sessionToken])
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const userId = userResult.rows[0].user_id

    // Use shared medications service
    const medicationsData = await MedicationsService.getMedicationsForUser(userId)

    res.status(200).json({
      success: true,
      medications: medicationsData.medications,
      summary: medicationsData.summary,
      lastUpdated: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching medications:', error)
    res.status(500).json({ 
      error: 'Failed to fetch medications',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}