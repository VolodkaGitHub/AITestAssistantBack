import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { terraClient } from '../../lib/terra-client'
import { WearablesDatabase } from '../../lib/wearables-database'
import { validateSessionToken } from '../../lib/auth-database'
import { withScalableMiddleware } from '../../lib/api-middleware'

/**
 * @openapi
 * /api/wearables/data:
 *   get:
 *     tags:
 *       - Wearables
 *     summary: Get health data from connected wearable devices
 *     description: >
 *       Retrieves sleep, activity, heart rate, and body composition data
 *       from all wearable devices connected by the user over the specified number of days.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: string
 *           default: "7"
 *         description: Number of days of health data to retrieve (default is 7)
 *     responses:
 *       200:
 *         description: Wearable health data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connections:
 *                   type: integer
 *                   example: 2
 *                 health_data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       provider:
 *                         type: string
 *                         example: "FITBIT"
 *                       data:
 *                         type: object
 *                         properties:
 *                           sleep:
 *                             type: array
 *                             description: Sleep data entries
 *                           activity:
 *                             type: array
 *                             description: Activity data entries
 *                           heart_rate:
 *                             type: array
 *                             description: Heart rate data entries
 *                           body:
 *                             type: array
 *                             description: Body composition data entries
 *                       summary:
 *                         type: object
 *                         properties:
 *                           total_data_points:
 *                             type: integer
 *                             example: 42
 *                           latest_sleep:
 *                             type: object
 *                             nullable: true
 *                           latest_activity:
 *                             type: object
 *                             nullable: true
 *                           latest_heart_rate:
 *                             type: object
 *                             nullable: true
 *                           latest_body:
 *                             type: object
 *                             nullable: true
 *                       last_sync:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-07-21T12:34:56Z"
 *                 last_updated:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-07-21T12:34:56Z"
 *                 message:
 *                   type: string
 *                   example: "No wearable devices connected"
 *       401:
 *         description: Missing or invalid authorization token
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
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

    const { days = '7' } = req.query

    // Get user's wearable connections
    const connections = await WearablesDatabase.getUserConnections(user.id)

    if (connections.length === 0) {
      return res.status(200).json({
        connections: 0,
        health_data: [],
        message: 'No wearable devices connected'
      })
    }

    // Get health data from all connected devices
    const healthData = await Promise.all(
      connections.map(async (connection) => {
        try {
          const endDate = new Date().toISOString().split('T')[0]
          const startDate = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000)
            .toISOString().split('T')[0]

          // Get different types of data from Terra
          const [sleepData, activityData, heartRateData, bodyData] = await Promise.all([
            terraClient.getSleep((connection as any).terra_user_id || 'default', startDate, endDate),
            terraClient.getActivity((connection as any).terra_user_id || 'default', startDate, endDate),
            terraClient.getHeartRateData((connection as any).terra_user_id || 'default', startDate, endDate),
            terraClient.getBodyData((connection as any).terra_user_id || 'default', startDate, endDate)
          ])

          const healthDataForProvider = {
            user_id: (connection as any).terra_user_id || 'default',
            provider: connection.provider,
            data: {
              sleep: sleepData,
              activity: activityData,
              heart_rate: heartRateData,
              body: bodyData
            }
          }

          // Generate basic health summary from the data
          const summary = {
            total_data_points: sleepData.length + activityData.length + heartRateData.length + bodyData.length,
            latest_sleep: sleepData.length > 0 ? sleepData[0] : null,
            latest_activity: activityData.length > 0 ? activityData[0] : null,
            latest_heart_rate: heartRateData.length > 0 ? heartRateData[0] : null,
            latest_body: bodyData.length > 0 ? bodyData[0] : null
          }
          
          return {
            provider: connection.provider,
            data: healthDataForProvider.data,
            summary: summary,
            last_sync: new Date().toISOString()
          }
        } catch (error) {
          console.error(`Error fetching data for ${connection.provider}:`, error)
          return {
            provider: connection.provider,
            error: 'Failed to fetch data',
            last_sync: connection.last_sync
          }
        }
      })
    )

    return res.status(200).json({
      connections: connections.length,
      health_data: healthData,
      last_updated: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error in wearables data handler:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch wearables data',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Export with rate limiting protection
export const wrappedHandler = withScalableMiddleware("GENERAL_API", {
  requireSession: false,
  requireUserContext: false
})(handler)

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}