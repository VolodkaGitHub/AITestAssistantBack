import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'

interface WearableMentionData {
  type: string
  summary: string
  detailed_data: any
  timestamp: string
}

/**
 * API endpoint for @mention wearables data
 * Returns last 7 days of daily health scores from all connected wearables
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate session
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization token' })
    }

    const sessionToken = authHeader.substring(7)
    const user = await validateSessionToken(sessionToken)
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    // Get daily health scores from the aggregated system
    const { dailyHealthAggregator } = await import('../../lib/daily-health-aggregator')
    
    const dailyScores = await dailyHealthAggregator.getUserDailyScores(
      user.id,
      undefined, // start_date - will default to recent data
      undefined, // end_date - will default to today  
      7 // last 7 days
    )

    if (!dailyScores || dailyScores.length === 0) {
      return res.status(200).json({
        type: 'wearables',
        summary: 'No wearable data available from connected devices',
        detailed_data: null,
        timestamp: new Date().toISOString()
      })
    }

    // Format summary from daily scores
    const summary = formatDailyScoresSummary(dailyScores)
    
    return res.status(200).json({
      type: 'wearables',
      summary,
      detailed_data: dailyScores,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching wearables mention data:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch wearables data',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

function formatDailyScoresSummary(dailyScores: any[]): string {
  if (!dailyScores || dailyScores.length === 0) {
    return 'No recent wearable data available'
  }

  const daysWithData = dailyScores.filter(day => 
    day.sleep_score || day.stress_score || day.respiratory_score
  ).length

  if (daysWithData === 0) {
    return 'No recent health scores available from connected devices'
  }

  // Get latest day with data
  const latestDay = dailyScores.find(day => 
    day.sleep_score || day.stress_score || day.respiratory_score
  )

  if (!latestDay) {
    return 'No recent health scores available'
  }

  const parts = []
  
  if (latestDay.sleep_score) {
    const sleepContributors = latestDay.sleep_contributors || {}
    parts.push(`Sleep: ${latestDay.sleep_score}/100 (REM: ${sleepContributors.rem || 'N/A'}, Deep: ${sleepContributors.deep || 'N/A'}, Light: ${sleepContributors.light || 'N/A'}, Efficiency: ${sleepContributors.efficiency || 'N/A'}%)`)
  }
  
  if (latestDay.stress_score) {
    const stressContributors = latestDay.stress_contributors || {}
    parts.push(`Stress: ${latestDay.stress_score}/100 (HRV: ${stressContributors.hrv || 'N/A'}, HR: ${stressContributors.hr || 'N/A'})`)
  }
  
  if (latestDay.respiratory_score) {
    const respContributors = latestDay.respiratory_contributors || {}
    const oxygen = respContributors.oxygen_saturation || respContributors.oxy || 'N/A'
    const breathing = respContributors.breathing_regularity || respContributors.respiration || 'N/A'
    parts.push(`Respiratory: ${latestDay.respiratory_score}/100 (O₂: ${oxygen}%, Breathing: ${breathing})`)
  }

  const dateStr = new Date(latestDay.score_date).toLocaleDateString()
  return `Latest health scores (${dateStr}): ${parts.join(' | ')}. ${daysWithData} days of data in last 7 days.`
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}