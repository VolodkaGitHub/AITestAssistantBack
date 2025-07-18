import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import { validateSessionToken } from '../../lib/auth-database'

/**
 * Health Timeline Mention API
 * Returns formatted health timeline data for @mention functionality
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate authentication
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' })
    }

    const token = authHeader.split(' ')[1]
    const user = await validateSessionToken(token)
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const client = await DatabasePool.getClient()

    try {
      // Fetch user health timeline
      const query = `
        SELECT 
          id,
          date,
          symptoms,
          findings,
          top_differential_diagnoses,
          chat_summary,
          created_at,
          updated_at
        FROM health_timeline 
        WHERE user_id = $1 
        ORDER BY date DESC, created_at DESC
        LIMIT 10
      `
      
      const result = await client.query(query, [user.id])
      const timeline = result.rows

      // Get recent timeline entries (last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const recentEntries = timeline.filter(entry => {
        const entryDate = new Date(entry.date)
        return entryDate >= thirtyDaysAgo
      })

      // Format summary for mention
      let summary = 'No health timeline entries recorded'
      if (timeline.length > 0) {
        const parts = [`${timeline.length} health timeline entries`]
        
        if (recentEntries.length > 0) {
          parts.push(`${recentEntries.length} recent (last 30 days)`)
        }
        
        // Get top symptoms from recent entries
        const recentSymptoms = recentEntries
          .flatMap(entry => {
            try {
              return typeof entry.symptoms === 'string' ? JSON.parse(entry.symptoms) : entry.symptoms || []
            } catch {
              return []
            }
          })
          .slice(0, 3)
        
        if (recentSymptoms.length > 0) {
          parts.push(`Recent symptoms: ${recentSymptoms.join(', ')}`)
        }
        
        summary = parts.join(', ')
      }

      return res.status(200).json({
        summary,
        data: {
          timeline,
          recent: recentEntries,
          total_count: timeline.length,
          recent_count: recentEntries.length,
          last_entry_date: timeline.length > 0 ? timeline[0].date : null
        },
        timestamp: new Date().toISOString()
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Health timeline mention API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}