import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { WearablesDatabase } from '../../lib/wearables-database'
import { terraClient } from '../../lib/terra-client'

/**
 * Daily data sync endpoint for Terra API wearables data
 * Syncs last 30 days of data for all connected devices
 */

/**
 * @openapi
 * /api/wearables/sync-daily:
 *   post:
 *     summary: Sync last 30 days of data for all connected wearable devices
 *     description: >
 *       Performs a comprehensive daily data synchronization from the Terra API
 *       for all wearable devices connected to the authorized user. Fetches and
 *       stores activity, sleep, heart rate, and body data for the last 30 days.
 *     tags:
 *       - Wearables
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         description: Bearer token for user authorization
 *         required: true
 *         schema:
 *           type: string
 *           example: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Successful synchronization of wearable data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Successfully synced 28 days of data
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_connections:
 *                       type: integer
 *                       example: 2
 *                     total_synced_days:
 *                       type: integer
 *                       example: 28
 *                     sync_period:
 *                       type: string
 *                       example: 2025-06-20 to 2025-07-20
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           provider:
 *                             type: string
 *                             example: OURA
 *                           synced_days:
 *                             type: integer
 *                             example: 28
 *                           activity_records:
 *                             type: integer
 *                             example: 28
 *                           sleep_records:
 *                             type: integer
 *                             example: 28
 *                           status:
 *                             type: string
 *                             example: success
 *                           error:
 *                             type: string
 *                             nullable: true
 *                             example: null
 *       401:
 *         description: Unauthorized access (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Missing or invalid authorization token
 *       405:
 *         description: Method not allowed (only POST supported)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error during synchronization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Failed to sync wearable data
 *                 details:
 *                   type: string
 *                   example: Database connection error
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

    console.log(`🔄 Starting comprehensive data sync for user ${user.email}`)

    // Get user's wearable connections
    const connections = await WearablesDatabase.getUserConnections(user.id)
    
    if (connections.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No wearable connections found',
        data: { connections: 0, synced_days: 0 }
      })
    }

    const today = new Date()
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    
    const startDate = thirtyDaysAgo.toISOString().split('T')[0]
    const endDate = today.toISOString().split('T')[0]

    console.log(`📅 Syncing data from ${startDate} to ${endDate}`)

    let totalSyncedDays = 0
    const syncResults: any[] = []

    for (const connection of connections) {
      if (connection.status !== 'connected') continue

      try {
        console.log(`🔄 Syncing ${connection.provider} data for ${connection.terra_user_id}`)

        // Fetch comprehensive Terra data
        const [activityData, sleepData, heartRateData, bodyData] = connection.terra_user_id ? await Promise.allSettled([
          terraClient.getActivity(connection.terra_user_id, startDate, endDate),
          terraClient.getSleep(connection.terra_user_id, startDate, endDate),
          terraClient.getHeartRateData(connection.terra_user_id, startDate, endDate),
          terraClient.getBody(connection.terra_user_id, startDate, endDate)
        ]) : [
          { status: 'rejected' as const, reason: 'No Terra user ID' },
          { status: 'rejected' as const, reason: 'No Terra user ID' },
          { status: 'rejected' as const, reason: 'No Terra user ID' },
          { status: 'rejected' as const, reason: 'No Terra user ID' }
        ]

        let syncedDays = 0

        // Process activity data
        if (activityData.status === 'fulfilled' && activityData.value?.length > 0) {
          for (const dayData of activityData.value) {
            if (dayData.metadata?.start_time || dayData.summary_date) {
              const recordedDate = new Date(dayData.metadata?.start_time || dayData.summary_date)
              
              // Save comprehensive daily data
              const comprehensiveData = {
                raw_data: dayData,
                calories: {
                  bmr_calories: dayData.calories_data?.BMR_calories,
                  total_burned: dayData.calories_data?.total_burned_calories,
                  net_activity: dayData.calories_data?.net_activity_calories,
                  net_intake: dayData.calories_data?.net_intake_calories
                },
                heart_rate: {
                  avg_bpm: dayData.heart_rate_data?.summary?.avg_hr_bpm,
                  resting_bpm: dayData.heart_rate_data?.summary?.resting_hr_bpm,
                  max_bpm: dayData.heart_rate_data?.summary?.max_hr_bpm,
                  min_bpm: dayData.heart_rate_data?.summary?.min_hr_bpm
                },
                activity: {
                  steps: dayData.distance_data?.steps || dayData.steps_data?.summary?.count,
                  distance_meters: dayData.distance_data?.distance_meters || dayData.distance_data?.summary?.distance_meters,
                  floors_climbed: dayData.distance_data?.floors_climbed,
                  active_duration: dayData.active_durations_data?.activity_seconds,
                  inactivity_seconds: dayData.active_durations_data?.inactivity_seconds
                },
                scores: {
                  recovery: dayData.scores?.recovery,
                  activity: dayData.scores?.activity,
                  sleep: dayData.scores?.sleep
                },
                stress: {
                  avg_level: dayData.stress_data?.avg_stress_level,
                  max_level: dayData.stress_data?.max_stress_level
                },
                oxygen: {
                  vo2_max: dayData.oxygen_data?.vo2max_ml_per_min_per_kg,
                  avg_saturation: dayData.oxygen_data?.avg_saturation_percentage
                },
                metadata: {
                  start_time: dayData.metadata?.start_time,
                  end_time: dayData.metadata?.end_time
                }
              }

              await WearablesDatabase.saveHealthData(
                user.id,
                connection.provider,
                'daily_comprehensive',
                comprehensiveData,
                recordedDate
              )

              // Save daily summary
              const summaryData = {
                steps: comprehensiveData.activity.steps || 0,
                calories_burned: comprehensiveData.calories.total_burned || 0,
                distance: comprehensiveData.activity.distance_meters ? 
                  Math.round(comprehensiveData.activity.distance_meters / 1000 * 100) / 100 : 0,
                active_minutes: comprehensiveData.activity.active_duration ?
                  Math.round(comprehensiveData.activity.active_duration / 60) : 0,
                resting_heart_rate: comprehensiveData.heart_rate.resting_bpm || 0,
                stress_score: comprehensiveData.stress.avg_level || 0
              }

              await WearablesDatabase.saveDailyHealthSummary(
                user.id,
                recordedDate.toISOString().split('T')[0],
                connection.provider,
                summaryData
              )

              syncedDays++
            }
          }
        }

        // Process sleep data
        if (sleepData.status === 'fulfilled' && sleepData.value?.length > 0) {
          for (const sleep of sleepData.value) {
            if (sleep.summary_date || sleep.metadata?.start_time) {
              const recordedDate = new Date(sleep.summary_date || sleep.metadata?.start_time)
              
              await WearablesDatabase.saveHealthData(
                user.id,
                connection.provider,
                'sleep',
                {
                  duration_hours: sleep.sleep_durations_data?.asleep?.duration_asleep_state_seconds ? 
                    sleep.sleep_durations_data.asleep.duration_asleep_state_seconds / 3600 : null,
                  efficiency: sleep.sleep_efficiency,
                  time_in_bed_hours: sleep.sleep_durations_data?.time_in_bed?.duration_in_bed_seconds ? 
                    sleep.sleep_durations_data.time_in_bed.duration_in_bed_seconds / 3600 : null,
                  phases: sleep.sleep_durations_data || {},
                  raw_data: sleep
                },
                recordedDate
              )

              // Update daily summary with sleep data
              if (sleep.sleep_durations_data?.asleep?.duration_asleep_state_seconds && sleep.sleep_efficiency) {
                const sleepSummary = {
                  sleep_duration: Math.round(sleep.sleep_durations_data.asleep.duration_asleep_state_seconds / 60), // minutes
                  sleep_efficiency: Math.round(sleep.sleep_efficiency * 100) // percentage
                }

                await WearablesDatabase.saveDailyHealthSummary(
                  user.id,
                  recordedDate.toISOString().split('T')[0],
                  connection.provider,
                  sleepSummary
                )
              }
            }
          }
        }

        // Update last sync time
        await WearablesDatabase.updateLastSync(user.id, connection.provider)
        
        totalSyncedDays += syncedDays
        syncResults.push({
          provider: connection.provider,
          synced_days: syncedDays,
          activity_records: activityData.status === 'fulfilled' ? activityData.value?.length || 0 : 0,
          sleep_records: sleepData.status === 'fulfilled' ? sleepData.value?.length || 0 : 0,
          status: 'success'
        })

        console.log(`✅ Successfully synced ${syncedDays} days for ${connection.provider}`)

      } catch (error) {
        console.error(`❌ Error syncing data for ${connection.provider}:`, error)
        syncResults.push({
          provider: connection.provider,
          synced_days: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`✅ Comprehensive sync completed: ${totalSyncedDays} total days synced`)

    return res.status(200).json({
      success: true,
      message: `Successfully synced ${totalSyncedDays} days of data`,
      data: {
        total_connections: connections.length,
        total_synced_days: totalSyncedDays,
        sync_period: `${startDate} to ${endDate}`,
        results: syncResults
      }
    })

  } catch (error) {
    console.error('❌ Error in comprehensive data sync:', error)
    return res.status(500).json({ 
      success: false,
      error: 'Failed to sync wearable data',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}