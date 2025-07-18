import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    await authDB.initializeSchema()
    return await handleGetUserActivity(req, res)
  } catch (error) {
    console.error('Activity API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// GET /api/profile/activity - Get user activity summary
async function handleGetUserActivity(req: NextApiRequest, res: NextApiResponse) {
  const { sessionToken } = req.query

  if (!sessionToken || typeof sessionToken !== 'string') {
    return res.status(401).json({ error: 'Session token required' })
  }

  try {
    // Validate session
    const sessionData = await authDB.validateSession(sessionToken)
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    // Get user activity summary
    const activity = await authDB.getUserActivity(sessionData.id)
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity data not found' })
    }

    // Get verification history
    const verificationHistory = await authDB.getUserVerificationHistory(sessionData.id)

    // Format activity data (fix array access issue)
    const activityData = Array.isArray(activity) ? activity[0] : activity;
    const formattedActivity = {
      accountCreated: activityData?.account_created,
      isVerified: activityData?.is_verified,
      sessionStats: {
        totalSessions: parseInt(activityData?.total_sessions || '0') || 0,
        activeSessions: parseInt(activityData?.active_sessions || '0') || 0,
        lastActivity: activityData?.last_session_activity
      },
      verificationStats: {
        totalAttempts: parseInt(activityData?.verification_attempts || '0') || 0,
        successfulAttempts: parseInt(activityData?.successful_verifications || '0') || 0,
        recentHistory: verificationHistory.slice(0, 10).map(attempt => ({
          type: attempt.attempt_type,
          successful: attempt.is_successful,
          ipAddress: attempt.ip_address,
          createdAt: attempt.created_at
        }))
      }
    }

    return res.status(200).json({
      success: true,
      activity: formattedActivity
    })
  } catch (error) {
    console.error('Get activity error:', error)
    return res.status(500).json({ error: 'Failed to retrieve activity data' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}