import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { WearablesDatabase } from '../../lib/wearables-database'

/**
 * Test Terra Webhook Processing
 * Manually processes the Terra payload you provided to test data storage
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Use the actual Terra payload from user's Oura Ring
    const terraPayload = {
      "user": {
        "scopes": "workout,email,personal,session,spo2,daily,tag,heartrate",
        "last_webhook_update": null,
        "provider": "OURA",
        "active": true,
        "user_id": "83d0e200-629d-4dac-8e29-93e9a889c8bc",
        "created_at": "2025-07-04T23:52:06.316126+00:00",
        "reference_id": "rdhanji786-oura-1751673115552"
      },
      "type": "daily",
      "data": [
        {
          "strain_data": {
            "strain_level": null
          },
          "oxygen_data": {
            "vo2_samples": [],
            "avg_saturation_percentage": null,
            "vo2max_ml_per_min_per_kg": null,
            "saturation_samples": []
          },
          "MET_data": {
            "num_low_intensity_minutes": 99,
            "num_moderate_intensity_minutes": 36,
            "avg_level": 1.28125,
            "num_high_intensity_minutes": 0,
            "num_inactive_minutes": 7
          },
          "summary_date": "2025-07-02"
        }
      ]
    }

    console.log('🧪 Testing Terra webhook processing with real payload')

    // Test connection lookup
    const connection = await WearablesDatabase.getConnectionByTerraUserId(terraPayload.user.user_id)
    
    if (!connection) {
      return res.status(404).json({ 
        error: 'No connection found',
        terra_user_id: terraPayload.user.user_id,
        suggestion: 'Make sure the Oura Ring is connected properly'
      })
    }

    console.log('✅ Found connection:', {
      app_user_id: connection.user_id,
      provider: connection.provider,
      terra_user_id: terraPayload.user.user_id
    })

    // Process the daily data
    for (const dailyData of terraPayload.data) {
      const recordDate = new Date(dailyData.summary_date || new Date())

      // Store comprehensive daily data
      await storeHealthDataByTerraUserId(
        terraPayload.user.user_id,
        'daily_comprehensive',
        {
          MET_data: dailyData.MET_data,
          strain_data: dailyData.strain_data,
          oxygen_data: dailyData.oxygen_data,
          raw_daily_data: dailyData,
          summary_date: dailyData.summary_date
        },
        recordDate
      )

      // Store activity data
      if (dailyData.MET_data) {
        await storeHealthDataByTerraUserId(
          terraPayload.user.user_id,
          'activity',
          {
            MET_data: dailyData.MET_data,
            avg_level: dailyData.MET_data.avg_level,
            low_intensity_minutes: dailyData.MET_data.num_low_intensity_minutes,
            moderate_intensity_minutes: dailyData.MET_data.num_moderate_intensity_minutes,
            high_intensity_minutes: dailyData.MET_data.num_high_intensity_minutes,
            inactive_minutes: dailyData.MET_data.num_inactive_minutes
          },
          recordDate
        )
      }
    }

    // Check what data is now in the database
    const storedData = await checkStoredData(connection.user_id)

    return res.status(200).json({
      success: true,
      message: 'Test webhook processing completed',
      connection: {
        app_user_id: connection.user_id,
        provider: connection.provider,
        terra_user_id: terraPayload.user.user_id
      },
      processed_data: terraPayload.data.length,
      stored_data: storedData
    })

  } catch (error) {
    console.error('Test webhook processing error:', error)
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}

async function storeHealthDataByTerraUserId(
  terraUserId: string,
  dataType: 'sleep' | 'activity' | 'heart_rate' | 'body' | 'daily_comprehensive',
  data: any,
  recordedAt: Date
) {
  try {
    const connection = await WearablesDatabase.getConnectionByTerraUserId(terraUserId)
    
    if (!connection) {
      console.log(`⚠️ No connection found for Terra user ${terraUserId}`)
      return
    }

    await WearablesDatabase.saveHealthData(
      connection.user_id, 
      connection.provider, 
      dataType, 
      data, 
      recordedAt
    )

    console.log(`✅ Stored ${dataType} data for user ${connection.user_id}:`, {
      terra_user_id: terraUserId,
      data_keys: Object.keys(data),
      recorded_at: recordedAt.toISOString()
    })

  } catch (error) {
    console.error(`❌ Failed to store ${dataType} data:`, error)
    throw error
  }
}

async function checkStoredData(userId: string) {
  try {
    // This would need a method to check stored data - for now return a placeholder
    return {
      message: 'Data storage verification would go here',
      user_id: userId
    }
  } catch (error) {
    console.error('Error checking stored data:', error)
    return { error: 'Failed to check stored data' }
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}