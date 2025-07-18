import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { healthTimelineDB } from '../../lib/health-timeline-database'
import { authDB } from '../../lib/auth-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize database schema
    await healthTimelineDB.initializeSchema()

    // Get session token from headers
    const sessionToken = req.headers.authorization?.replace('Bearer ', '')
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    // Verify session and get user
    const user = await authDB.validateSession(sessionToken)
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    if (req.method === 'GET') {
      // Get user's health timeline
      const limit = parseInt(req.query.limit as string) || 50
      const timeline = await healthTimelineDB.getUserHealthTimeline(user.id, limit)
      
      // Get timeline stats
      const stats = await healthTimelineDB.getHealthTimelineStats(user.id)

      return res.status(200).json({
        success: true,
        timeline,
        stats,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name
        }
      })
    }

    if (req.method === 'DELETE') {
      // Delete specific timeline entry
      const { entryId } = req.body
      
      if (!entryId) {
        return res.status(400).json({ error: 'Entry ID is required' })
      }

      const deleted = await healthTimelineDB.deleteHealthTimelineEntry(entryId, user.id)
      
      if (!deleted) {
        return res.status(404).json({ error: 'Timeline entry not found' })
      }

      return res.status(200).json({
        success: true,
        message: 'Timeline entry deleted successfully'
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (error) {
    console.error('Health timeline API error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}