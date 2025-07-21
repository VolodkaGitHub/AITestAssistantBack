import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

/**
 * @openapi
 * /api/profile/activity:
 *   get:
 *     tags:
 *       - Profile
 *     summary: Get user activity summary
 *     description: >
 *       Retrieves a summary of user activity including account creation date, 
 *       verification status, session statistics, and recent verification attempts.
 *       Requires a valid session token provided as a query parameter.
 *     parameters:
 *       - name: sessionToken
 *         in: query
 *         description: User session token for authentication
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully returned user activity data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 activity:
 *                   type: object
 *                   properties:
 *                     accountCreated:
 *                       type: string
 *                       format: date-time
 *                       description: Date when the user account was created
 *                     isVerified:
 *                       type: boolean
 *                       description: Indicates if the user is verified
 *                     sessionStats:
 *                       type: object
 *                       properties:
 *                         totalSessions:
 *                           type: integer
 *                           description: Total number of user sessions
 *                         activeSessions:
 *                           type: integer
 *                           description: Number of currently active sessions
 *                         lastActivity:
 *                           type: string
 *                           format: date-time
 *                           description: Timestamp of the last user session activity
 *                     verificationStats:
 *                       type: object
 *                       properties:
 *                         totalAttempts:
 *                           type: integer
 *                           description: Total verification attempts
 *                         successfulAttempts:
 *                           type: integer
 *                           description: Number of successful verifications
 *                         recentHistory:
 *                           type: array
 *                           description: List of recent verification attempts (up to 10)
 *                           items:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                                 description: Type of verification attempt
 *                               successful:
 *                                 type: boolean
 *                                 description: Whether the attempt was successful
 *                               ipAddress:
 *                                 type: string
 *                                 description: IP address from which the attempt was made
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                                 description: Timestamp of the attempt
 *       401:
 *         description: Unauthorized - session token missing or invalid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Session token required
 *       404:
 *         description: Activity data not found for the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Activity data not found
 *       405:
 *         description: Method not allowed (only GET supported)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error
 */

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