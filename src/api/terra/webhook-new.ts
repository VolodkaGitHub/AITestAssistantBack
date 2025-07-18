/**
 * New Terra Webhook Endpoint - No Signature Verification
 * Handles real-time data updates from Terra API
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { WearablesDatabase } from '../../lib/wearables-database';

interface WebhookResponse {
  success: boolean;
  message?: string;
  data?: any;
  received_type?: string;
  timestamp?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebhookResponse>
) {
  console.log('🚀 NEW TERRA WEBHOOK CALLED:', {
    method: req.method,
    timestamp: new Date().toISOString(),
    headers: Object.keys(req.headers)
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const webhookData = req.body;
    
    console.log('📨 Terra webhook data received:', {
      type: webhookData?.type,
      user_id: webhookData?.user?.user_id,
      data_count: webhookData?.data?.length || 0,
      timestamp: new Date().toISOString()
    });

    // Process webhook data based on type
    switch (webhookData?.type) {
      case 'daily':
        await processDailyData(webhookData);
        break;
      case 'sleep':
        await processSleepData(webhookData);
        break;
      case 'body':
        await processBodyData(webhookData);
        break;
      case 'activity':
        await processActivityData(webhookData);
        break;
      case 'athlete':
        await processAthleteData(webhookData);
        break;
      case 'deauth':
        await processDeauthData(webhookData);
        break;
      default:
        console.log('⚠️ Unknown webhook type:', webhookData?.type);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully',
      received_type: webhookData?.type,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Terra webhook error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

// Processing functions
async function processDailyData(webhookData: any) {
  console.log('📊 Processing daily data for user:', webhookData.user?.user_id);
  
  const { user, data } = webhookData;
  if (!user?.user_id || !data?.[0]) return;

  for (const dailyData of data) {
    if (dailyData.summary_date) {
      await storeHealthDataByTerraUserId(
        user.user_id,
        'activity',
        {
          steps: dailyData.steps,
          calories_burned: dailyData.calories_total,
          distance_meters: dailyData.distance_data?.distance_metres,
          active_duration_seconds: dailyData.active_durations_data?.activity_seconds
        },
        new Date(dailyData.summary_date)
      );
    }
  }
}

async function processSleepData(webhookData: any) {
  console.log('😴 Processing sleep data for user:', webhookData.user?.user_id);
  
  const { user, data } = webhookData;
  if (!user?.user_id || !data?.[0]) return;

  for (const sleepData of data) {
    if (sleepData.summary_date) {
      await storeHealthDataByTerraUserId(
        user.user_id,
        'sleep',
        {
          duration_hours: sleepData.sleep_durations_data?.asleep_duration_seconds ? sleepData.sleep_durations_data.asleep_duration_seconds / 3600 : null,
          efficiency: sleepData.sleep_efficiency,
          time_in_bed_hours: sleepData.sleep_durations_data?.in_bed_duration_seconds ? sleepData.sleep_durations_data.in_bed_duration_seconds / 3600 : null,
          phases: {
            deep_sleep_duration_seconds: sleepData.sleep_durations_data?.deep_sleep_duration_seconds,
            light_sleep_duration_seconds: sleepData.sleep_durations_data?.light_sleep_duration_seconds,
            rem_sleep_duration_seconds: sleepData.sleep_durations_data?.rem_sleep_duration_seconds,
            awake_duration_seconds: sleepData.sleep_durations_data?.awake_duration_seconds
          }
        },
        new Date(sleepData.summary_date)
      );
    }
  }
}

async function processBodyData(webhookData: any) {
  console.log('🏋️ Processing body data for user:', webhookData.user?.user_id);
  
  const { user, data } = webhookData;
  if (!user?.user_id || !data?.[0]) return;

  for (const bodyData of data) {
    if (bodyData.summary_date) {
      await storeHealthDataByTerraUserId(
        user.user_id,
        'body',
        {
          weight_kg: bodyData.body_data?.weight_kg,
          body_fat_percentage: bodyData.body_data?.body_fat_percentage,
          muscle_mass_kg: bodyData.body_data?.muscle_mass_kg,
          bone_mass_kg: bodyData.body_data?.bone_mass_kg,
          hydration_kg: bodyData.body_data?.hydration_kg,
          measurements: bodyData.measurements_data
        },
        new Date(bodyData.summary_date)
      );
    }
  }
}

async function processActivityData(webhookData: any) {
  console.log('🏃 Processing activity data for user:', webhookData.user?.user_id);
  
  const { user, data } = webhookData;
  if (!user?.user_id || !data?.[0]) return;

  for (const activityData of data) {
    if (activityData.summary_date) {
      await storeHealthDataByTerraUserId(
        user.user_id,
        'activity',
        {
          steps: activityData.steps,
          calories_burned: activityData.calories_total,
          distance_meters: activityData.distance_data?.distance_metres,
          active_duration_seconds: activityData.active_durations_data?.activity_seconds
        },
        new Date(activityData.summary_date)
      );
    }
  }
}

async function processAthleteData(webhookData: any) {
  console.log('👤 Processing athlete data for user:', webhookData.user?.user_id);
}

async function processDeauthData(webhookData: any) {
  console.log('🔌 Processing deauth for user:', webhookData.user?.user_id);
}

// Store health data function
async function storeHealthDataByTerraUserId(
  terraUserId: string,
  dataType: 'sleep' | 'activity' | 'heart_rate' | 'body',
  data: any,
  recordedAt: Date
) {
  try {
    const connection = await WearablesDatabase.getConnectionByTerraUserId(terraUserId);
    
    if (!connection) {
      console.log(`⚠️ No connection found for Terra user ${terraUserId}`);
      return;
    }

    await WearablesDatabase.saveHealthData(
      connection.user_id, 
      connection.provider, 
      dataType, 
      data, 
      recordedAt
    );

    await WearablesDatabase.updateLastSync(connection.user_id, connection.provider);
    
    console.log(`✅ Stored ${dataType} data for user ${connection.user_id}:`, {
      terra_user_id: terraUserId,
      data_keys: Object.keys(data),
      recorded_at: recordedAt.toISOString()
    });

  } catch (error) {
    console.error(`❌ Failed to store ${dataType} data:`, error);
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}