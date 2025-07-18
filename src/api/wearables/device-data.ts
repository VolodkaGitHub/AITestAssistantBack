import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { WearablesDatabase } from '../../lib/wearables-database'
import { validateSessionToken } from '../../lib/auth-database'
import { withScalableMiddleware } from '../../lib/api-middleware'

interface HealthDataRow {
  id: string
  user_id: string
  terra_user_id: string
  data_type: 'activity' | 'sleep' | 'heart_rate' | 'body'
  data: any
  recorded_at: string
  sync_timestamp: string
}

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

    const { provider, id } = req.query

    console.log('Authenticated user ID:', user.id)
    console.log('Looking for provider:', provider, 'with ID:', id)

    if (!provider || !id) {
      return res.status(400).json({ error: 'Provider and ID are required' })
    }

    // Get specific device connection from database directly
    const { DatabasePool } = require('../../../lib/database-pool')
    const client = await DatabasePool.getClient()

    try {
      const connectionResult = await client.query(`
        SELECT 
          id,
          user_id,
          provider,
          terra_user_id,
          connected_at,
          last_sync,
          scopes,
          is_active,
          status
        FROM wearable_connections 
        WHERE user_id = $1 AND provider = $2 AND (terra_user_id = $3 OR id::text = $3) AND is_active = true
      `, [user.id, provider, id])

      if (connectionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Device not found' })
      }

      const deviceConnection = connectionResult.rows[0]

      // Get recent health data for this specific device (last 7 days)
      const healthDataResult = await client.query(`
        SELECT 
          data_type,
          provider,
          data,
          recorded_at
        FROM wearable_health_data 
        WHERE user_id = $1 AND provider = $2 AND recorded_at >= NOW() - INTERVAL '30 days'
        ORDER BY recorded_at DESC
      `, [user.id, provider])

    const healthData = healthDataResult.rows
    
    console.log(`Found ${healthData.length} health data records for provider ${provider}`)
    console.log('Data types:', healthData.map((d: HealthDataRow) => d.data_type))

    // Group data by type
    const activityData = healthData.filter((d: HealthDataRow) => d.data_type === 'activity')
    const sleepData = healthData.filter((d: HealthDataRow) => d.data_type === 'sleep')
    const heartRateData = healthData.filter((d: HealthDataRow) => d.data_type === 'heart_rate')
    const bodyData = healthData.filter((d: HealthDataRow) => d.data_type === 'body')

    // Calculate summaries from wearable data
    const totalSteps = activityData.reduce((sum: number, d: any) => {
      const data = typeof d.data === 'string' ? JSON.parse(d.data) : d.data
      return sum + (data?.steps || data?.activity?.steps || 0)
    }, 0)
    
    const totalCalories = activityData.reduce((sum: number, d: any) => {
      const data = typeof d.data === 'string' ? JSON.parse(d.data) : d.data
      return sum + (data?.calories_burned || data?.activity?.calories_burned || 0)
    }, 0)
    
    // Extract comprehensive sleep metrics from Oura data
    const avgSleepHours = sleepData.length > 0 
      ? sleepData.reduce((sum: number, d: any) => {
          const data = typeof d.data === 'string' ? JSON.parse(d.data) : d.data
          return sum + (data?.duration_hours || 0)
        }, 0) / sleepData.length 
      : 0

    const avgSleepScore = sleepData.length > 0 
      ? sleepData.reduce((sum: number, d: any) => {
          const data = typeof d.data === 'string' ? JSON.parse(d.data) : d.data
          return sum + (data?.sleep_score || 0)
        }, 0) / sleepData.length 
      : 0

    const avgSleepEfficiency = sleepData.length > 0 
      ? sleepData.reduce((sum: number, d: any) => {
          const data = typeof d.data === 'string' ? JSON.parse(d.data) : d.data
          return sum + (data?.efficiency || 0)
        }, 0) / sleepData.length 
      : 0

    // Latest sleep phases breakdown
    const latestSleepPhases = sleepData.length > 0 
      ? (() => {
          const latest = sleepData[0]
          const data = typeof latest.data === 'string' ? JSON.parse(latest.data) : latest.data
          return {
            deep_hours: data?.deep_sleep_hours || 0,
            light_hours: data?.light_sleep_hours || 0,
            rem_hours: data?.rem_sleep_hours || 0,
            awake_hours: data?.awake_hours || 0
          }
        })()
      : null

    // Sleep quality indicators
    const latestSleepMetrics = sleepData.length > 0 
      ? (() => {
          const latest = sleepData[0]
          const data = typeof latest.data === 'string' ? JSON.parse(latest.data) : latest.data
          return {
            sleep_latency_minutes: data?.sleep_latency_minutes || null,
            num_wakeup_events: data?.num_wakeup_events || null,
            resting_hr: data?.resting_hr || null,
            avg_breaths_per_min: data?.avg_breaths_per_min || null,
            temperature_delta: data?.temperature_delta || null,
            recovery_level: data?.recovery_level || null
          }
        })()
      : null
    
    const latestHeartRate = heartRateData.length > 0 
      ? (() => {
          const latest = heartRateData[0]
          const data = typeof latest.data === 'string' ? JSON.parse(latest.data) : latest.data
          return data?.heart_rate || data
        })()
      : null

    // Handle daily_comprehensive data from Oura (which includes multiple data types)
    const dailyData = healthData.filter((d: any) => d.data_type === 'daily_comprehensive')
    
    // Extract MET data and activity intensity from Oura daily comprehensive
    const totalActiveMinutes = dailyData.reduce((sum: number, d: any) => {
      const data = typeof d.data === 'string' ? JSON.parse(d.data) : d.data
      const metData = data?.MET_data || {}
      return sum + (metData.num_low_intensity_minutes || 0) + 
                   (metData.num_moderate_intensity_minutes || 0) + 
                   (metData.num_high_intensity_minutes || 0)
    }, 0)
    
    const avgActivityLevel = dailyData.length > 0 
      ? dailyData.reduce((sum: number, d: any) => {
          const data = typeof d.data === 'string' ? JSON.parse(d.data) : d.data
          return sum + (data?.MET_data?.avg_level || 0)
        }, 0) / dailyData.length 
      : 0

    // Extract oxygen data
    const oxygenData = dailyData.length > 0 
      ? (() => {
          const latest = dailyData[0]
          const data = typeof latest.data === 'string' ? JSON.parse(latest.data) : latest.data
          return {
            saturation: data?.oxygen_data?.avg_saturation_percentage || null,
            vo2max: data?.oxygen_data?.vo2max_ml_per_min_per_kg || null,
            samples: data?.oxygen_data?.saturation_samples?.length || 0
          }
        })()
      : null

    // Extract strain data
    const strainLevel = dailyData.length > 0 
      ? (() => {
          const latest = dailyData[0]
          const data = typeof latest.data === 'string' ? JSON.parse(latest.data) : latest.data
          return data?.strain_data?.strain_level || null
        })()
      : null

    // Calculate activity intensity breakdown
    const activityIntensity = dailyData.length > 0 
      ? dailyData.reduce((acc: any, d: any) => {
          const data = typeof d.data === 'string' ? JSON.parse(d.data) : d.data
          const metData = data?.MET_data || {}
          return {
            inactive: acc.inactive + (metData.num_inactive_minutes || 0),
            low: acc.low + (metData.num_low_intensity_minutes || 0),
            moderate: acc.moderate + (metData.num_moderate_intensity_minutes || 0),
            high: acc.high + (metData.num_high_intensity_minutes || 0)
          }
        }, { inactive: 0, low: 0, moderate: 0, high: 0 })
      : { inactive: 0, low: 0, moderate: 0, high: 0 }

    console.log('Oura data extraction results:', {
      totalActiveMinutes,
      avgActivityLevel: Math.round(avgActivityLevel * 100) / 100,
      activityIntensity,
      oxygenData,
      strainLevel,
      dailyDataCount: dailyData.length,
      activityDataCount: activityData.length
    })

    return res.status(200).json({
      connection: {
        id: deviceConnection.terra_user_id,
        user_id: deviceConnection.terra_user_id,
        provider: deviceConnection.provider,
        provider_display: deviceConnection.provider === 'GOOGLE' ? 'Google Fit' : 
                         deviceConnection.provider === 'OURA' ? 'Oura Ring' : 
                         deviceConnection.provider,
        connected_at: deviceConnection.connected_at,
        last_sync: deviceConnection.last_sync,
        is_active: deviceConnection.is_active,
        status: deviceConnection.status || 'connected'
      },
      summary: {
        total_active_minutes: totalActiveMinutes,
        avg_activity_level: Math.round(avgActivityLevel * 100) / 100,
        strain_level: strainLevel,
        oxygen_saturation: oxygenData?.saturation,
        vo2_max: oxygenData?.vo2max,
        total_steps: totalSteps,
        total_calories: totalCalories,
        avg_sleep_hours: Math.round(avgSleepHours * 10) / 10,
        avg_sleep_score: Math.round(avgSleepScore),
        avg_sleep_efficiency: Math.round(avgSleepEfficiency * 100),
        activity_intensity: activityIntensity,
        latest_heart_rate: latestHeartRate,
        latest_sleep_phases: latestSleepPhases,
        latest_sleep_metrics: latestSleepMetrics,
        data_points: healthData.length
      },
      recent_data: {
        activity: activityData.slice(-7), // Last 7 activity records
        sleep: sleepData.slice(-7), // Last 7 sleep records
        heart_rate: heartRateData.slice(-10), // Last 10 heart rate records
        body: bodyData.slice(-7), // Last 7 body measurements
        daily_comprehensive: dailyData.slice(-7) // Last 7 daily comprehensive records
      },
      oura_metrics: dailyData.length > 0 ? {
        met_data_available: true,
        total_intensity_minutes: totalActiveMinutes,
        activity_level_avg: Math.round(avgActivityLevel * 100) / 100,
        intensity_breakdown: activityIntensity,
        oxygen_monitoring: oxygenData,
        strain_tracking: strainLevel !== null
      } : null,
      last_sync: deviceConnection.last_sync
    })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Error in device data handler:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch device data',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Export with rate limiting protection
export default withScalableMiddleware("GENERAL_API", {
  requireSession: false,
  requireUserContext: false
})(handler)

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}