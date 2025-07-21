import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'

/**
 * @deprecated This endpoint is deprecated. Use /api/terra/sync with sync_type: 'daily' instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Daily Terra Data Sync for All Users
 * This endpoint runs daily to sync all connected Terra users' data
 */

const dbPool = DatabasePool.getInstance()

interface TerraUser {
  user_id: string
  provider: string
  email: string
  last_sync: string
}

/**
 * @openapi
 * /api/terra/daily-sync:
 *   post:
 *     summary: Deprecated daily Terra data sync (use /api/terra/sync instead)
 *     description: |
 *       **[DEPRECATED]** Use `/api/terra/sync` with `sync_type: "daily"` instead.  
 *       This endpoint triggers daily sync of Terra data (e.g. sleep, daily activity) for all connected users.
 *       Requires a valid `x-cron-secret` header.
 *     tags:
 *       - Terra
 *     deprecated: true
 *     security:
 *       - CronSecretHeader: []
 *     responses:
 *       200:
 *         description: Sync completed
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
 *                   example: Daily Terra sync completed
 *                 results:
 *                   type: object
 *                   properties:
 *                     total_users:
 *                       type: integer
 *                       example: 10
 *                     successful_syncs:
 *                       type: integer
 *                       example: 9
 *                     failed_syncs:
 *                       type: integer
 *                       example: 1
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: user@example.com: Failed to fetch sleep data
 *       401:
 *         description: Unauthorized - invalid or missing cron secret
 *       405:
 *         description: Method not allowed - only POST supported
 *       500:
 *         description: Internal server error
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify this is an authorized cron job or admin request
  const cronSecret = req.headers['x-cron-secret']
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('🔄 Starting daily Terra data sync for all users')

  try {
    const TERRA_API_KEY = process.env.TERRA_API_KEY
    const TERRA_DEV_ID = process.env.TERRA_DEV_ID
    
    if (!TERRA_API_KEY || !TERRA_DEV_ID) {
      throw new Error('Terra production credentials not configured')
    }

    // Get all connected Terra users
    const connectedUsers = await getConnectedTerraUsers()
    console.log(`📊 Found ${connectedUsers.length} connected Terra users`)

    const syncResults = {
      total_users: connectedUsers.length,
      successful_syncs: 0,
      failed_syncs: 0,
      errors: [] as string[]
    }

    // Sync data for each connected user
    for (const user of connectedUsers) {
      try {
        console.log(`🔄 Syncing data for user: ${user.email} (${user.provider})`)
        
        await syncUserData(user, TERRA_API_KEY, TERRA_DEV_ID)
        
        // Update last sync timestamp
        await updateLastSync(user.user_id)
        
        syncResults.successful_syncs++
        console.log(`✅ Successfully synced data for ${user.email}`)
        
      } catch (error) {
        console.error(`❌ Failed to sync data for ${user.email}:`, error)
        syncResults.failed_syncs++
        syncResults.errors.push(`${user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    console.log(`📈 Daily sync complete: ${syncResults.successful_syncs} success, ${syncResults.failed_syncs} failed`)

    return res.status(200).json({
      success: true,
      message: 'Daily Terra sync completed',
      results: syncResults
    })

  } catch (error) {
    console.error('❌ Daily Terra sync failed:', error)
    return res.status(500).json({
      success: false,
      error: 'Daily Terra sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function getConnectedTerraUsers(): Promise<TerraUser[]> {
  const client = await DatabasePool.getClient()
  try {
    const query = `
      SELECT DISTINCT 
        wc.user_id,
        wc.provider,
        u.email,
        wc.last_sync
      FROM wearable_connections wc
      JOIN users u ON wc.email = u.email
      WHERE wc.is_active = true
        AND wc.provider IN ('OURA', 'GOOGLE')
      ORDER BY wc.last_sync ASC
    `
    
    const result = await client.query(query)
    return result.rows
  } finally {
    client.release()
  }
}

async function syncUserData(user: TerraUser, apiKey: string, devId: string): Promise<void> {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Last 7 days

  // Define endpoint configurations for Terra API v2
  const endpointConfigs = [
    { type: 'sleep', method: 'GET', useBody: false },
    { type: 'daily', method: 'GET', useBody: false }
  ]
  
  for (const config of endpointConfigs) {
    try {
      let url = `https://api.tryterra.co/v2/${config.type}`
      let requestOptions: any = {
        method: config.method,
        headers: {
          'dev-id': devId,
          'x-api-key': apiKey,
        }
      }

      if (config.useBody) {
        // Use JSON body for POST endpoints (currently none working)
        requestOptions.headers['Content-Type'] = 'application/json'
        requestOptions.body = JSON.stringify({
          user_id: user.user_id,
          start_date: startDate,
          end_date: endDate
        })
      } else {
        // Use query parameters for GET endpoints
        url += `?user_id=${user.user_id}&start_date=${startDate}&end_date=${endDate}`
      }

      const response = await fetch(url, requestOptions)

      if (response.ok) {
        const data = await response.json()
        if (data.data && data.data.length > 0) {
          // Store raw Terra data
          await storeWearableData(user.user_id, user.email, config.type, data)
          
          // Also store processed health metrics in wearable_health_data table
          await storeProcessedHealthData(user.user_id, user.provider, config.type, data)
          
          console.log(`  ✅ Synced ${config.type} data for ${user.email}: ${data.data.length} points`)
        } else {
          console.log(`  ⚠️  No ${config.type} data available for ${user.email}`)
        }
      } else {
        const errorText = await response.text()
        console.log(`  ❌ ${config.type} failed for ${user.email}: ${response.status} - ${errorText.substring(0, 100)}`)
      }
    } catch (error) {
      console.error(`  ❌ Failed to sync ${config.type} for ${user.email}:`, error)
    }
  }
}

async function storeWearableData(userId: string, email: string, dataType: string, data: any): Promise<void> {
  const client = await DatabasePool.getClient()
  try {
    // Store the raw Terra data
    const query = `
      INSERT INTO wearable_data (
        user_id, email, data_type, data, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id, data_type, created_at::date) 
      DO UPDATE SET 
        data = $4,
        updated_at = NOW()
    `
    
    await client.query(query, [userId, email, dataType, JSON.stringify(data)])
  } finally {
    client.release()
  }
}

async function storeProcessedHealthData(userId: string, provider: string, dataType: string, terraData: any): Promise<void> {
  const client = await DatabasePool.getClient()
  try {
    // Process Terra data into health metrics format that the UI expects
    if (terraData.data && Array.isArray(terraData.data)) {
      for (const dailyData of terraData.data) {
        const recordedAt = new Date(dailyData.metadata?.upload_timestamp || dailyData.metadata?.start_time || new Date())
        
        let processedData: any = {
          data_type: dataType,
          recorded_at: recordedAt,
          data_points: 1
        }

        // Process different data types into standardized format
        if (dataType === 'daily' && dailyData.summary) {
          processedData = {
            ...processedData,
            steps: dailyData.summary.steps || 0,
            calories: dailyData.summary.calories_total || 0,
            distance: dailyData.summary.distance_total || 0,
            active_minutes: dailyData.summary.active_durations_summary?.active_seconds || 0,
            sleep_score: dailyData.summary.sleep_score || null,
            training_stress: dailyData.summary.stress_level || null,
            respiratory_health: dailyData.summary.respiratory_rate || null,
            immunity_index: dailyData.summary.immunity_index || null
          }
        } else if (dataType === 'sleep' && dailyData.sleep_durations) {
          processedData = {
            ...processedData,
            sleep_duration: dailyData.sleep_durations.total_sleep_duration || 0,
            sleep_score: dailyData.sleep_efficiency || null,
            deep_sleep: dailyData.sleep_durations.deep_sleep_duration || 0,
            light_sleep: dailyData.sleep_durations.light_sleep_duration || 0,
            rem_sleep: dailyData.sleep_durations.rem_sleep_duration || 0
          }
        }

        // Insert into wearable_health_data table
        const healthQuery = `
          INSERT INTO wearable_health_data (
            user_id, provider, data_type, recorded_at, data_points,
            steps, calories, distance, active_minutes, sleep_duration,
            sleep_score, training_stress, respiratory_health, immunity_index,
            deep_sleep, light_sleep, rem_sleep, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
          ON CONFLICT (user_id, provider, data_type, recorded_at::date) 
          DO UPDATE SET 
            data_points = $5,
            steps = $6,
            calories = $7,
            distance = $8,
            active_minutes = $9,
            sleep_duration = $10,
            sleep_score = $11,
            training_stress = $12,
            respiratory_health = $13,
            immunity_index = $14,
            deep_sleep = $15,
            light_sleep = $16,
            rem_sleep = $17,
            updated_at = NOW()
        `
        
        await client.query(healthQuery, [
          userId, provider, processedData.data_type, processedData.recorded_at, processedData.data_points,
          processedData.steps || null, processedData.calories || null, processedData.distance || null,
          processedData.active_minutes || null, processedData.sleep_duration || null,
          processedData.sleep_score || null, processedData.training_stress || null,
          processedData.respiratory_health || null, processedData.immunity_index || null,
          processedData.deep_sleep || null, processedData.light_sleep || null, processedData.rem_sleep || null
        ])
      }
    }
  } finally {
    client.release()
  }
}

async function updateLastSync(userId: string): Promise<void> {
  const client = await DatabasePool.getClient()
  try {
    const query = `
      UPDATE wearable_connections 
      SET last_sync = NOW() 
      WHERE user_id = $1
    `
    
    await client.query(query, [userId])
  } finally {
    client.release()
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}