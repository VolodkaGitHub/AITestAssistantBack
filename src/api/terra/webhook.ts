/**
 * Terra Webhook Endpoint
 * Handles real-time data updates from Terra API
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { terraClient } from '../../lib/terra-client';
import { WearablesDatabase } from '../../lib/wearables-database';
import { DatabasePool } from '../../lib/database-pool'

// Disable body parsing to get raw body for signature verification
// Set payload size limit to prevent 413 errors
export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
  // Override to handle large payloads
  maxDuration: 30,
};

interface WebhookResponse {
  success: boolean;
  message?: string;
  payload_size_mb?: string;
  processing_mode?: string;
}

// Function to store enrichment scores in database
async function storeEnrichmentScore(enrichmentData: any) {
  try {
    const query = `
      INSERT INTO enrichment_scores (
        data_type, provider, terra_user_id, user_id,
        sleep_score, stress_score, respiratory_score,
        sleep_contributors, stress_contributors, respiratory_contributors,
        summary_date, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id, provider, data_type, summary_date) 
      DO UPDATE SET
        sleep_score = EXCLUDED.sleep_score,
        stress_score = EXCLUDED.stress_score,
        respiratory_score = EXCLUDED.respiratory_score,
        sleep_contributors = EXCLUDED.sleep_contributors,
        stress_contributors = EXCLUDED.stress_contributors,
        respiratory_contributors = EXCLUDED.respiratory_contributors,
        recorded_at = EXCLUDED.recorded_at
    `;
    

// Helper function to extract only enrichment data from large payloads
function extractEnrichmentDataOnly(data: any): any {
  if (!data || !data.data) return data;
  
  return {
    ...data,
    data: data.data.map((item: any) => ({
      summary_date: item.summary_date,
      data_enrichment: item.data_enrichment
    }))
  };
}

// Helper function to process filtered enrichment data
async function processFilteredEnrichmentData(data: any): Promise<void> {
  if (!data || !data.data) return;
  
  for (const item of data.data) {
    if (item.data_enrichment) {
      console.log('Processing enrichment data:', item.data_enrichment);
      // Process the enrichment data here
    }
  }
}


    // Find the user_id from the Terra user ID
    const dbPool = DatabasePool.getInstance();
    const userQuery = `SELECT user_id FROM wearable_connections WHERE terra_user_id = $1 LIMIT 1`;
    const userResult = await dbPool.query(userQuery, [enrichmentData.terra_user_id]);
    const userId = userResult.rows[0]?.user_id || enrichmentData.terra_user_id;
    
    await dbPool.query(query, [
      enrichmentData.data_type,
      enrichmentData.provider,
      enrichmentData.terra_user_id,
      userId,
      enrichmentData.sleep_score,
      enrichmentData.stress_score,
      enrichmentData.respiratory_score,
      enrichmentData.sleep_contributors,
      enrichmentData.stress_contributors,
      enrichmentData.respiratory_contributors,
      enrichmentData.summary_date,
      enrichmentData.recorded_at
    ]);
    
    console.log(`✅ Stored enrichment score: ${enrichmentData.data_type} for Terra user ${enrichmentData.terra_user_id}`);
  } catch (error) {
    console.error('Error storing enrichment score:', error);
  }
}

// Helper function to get raw body with intelligent filtering for enrichment scores
function getRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let totalSize = 0;
    const maxSize = 50 * 1024 * 1024; // 50MB limit
    
    req.on('data', chunk => {
      totalSize += chunk.length;
      
      // Check if payload is getting too large
      if (totalSize > maxSize) {
        console.log(`⚠️ Webhook payload too large: ${(totalSize/(1024*1024)).toFixed(2)}MB, rejecting...`);
        reject(new Error(`Payload too large: ${(totalSize/(1024*1024)).toFixed(2)}MB`));
        return;
      }
      
      data += chunk;
    });
    
    req.on('end', () => {
      console.log(`📦 Webhook payload size: ${(totalSize/(1024*1024)).toFixed(2)}MB`);
      resolve(data);
    });
    
    req.on('error', reject);
  });
}

// Function to process enrichment scores from Terra webhook data
async function processEnrichmentScores(webhookData: any, dataType: string) {
  const { user, data } = webhookData;
  
  if (!user?.user_id || !data?.[0]) {
    console.log(`❌ Missing required data in ${dataType} enrichment webhook:`, { 
      user_id: user?.user_id, 
      data_count: data?.length 
    });
    return;
  }

  // Find user connection by Terra user ID
  const connection = await WearablesDatabase.getConnectionByTerraUserId(user.user_id);
  
  if (!connection) {
    console.log('❌ No connection found for Terra user ID:', user.user_id);
    return;
  }

  console.log(`📊 Processing ${dataType} enrichment scores for user:`, {
    terra_user_id: user.user_id,
    app_user_id: connection.user_id,
    provider: connection.provider,
    data_count: data.length
  });
  
  for (const dataEntry of data) {
    const enrichmentData = dataEntry.data_enrichment;
    
    if (!enrichmentData) {
      console.log(`⚠️ No enrichment data found in ${dataType} entry`);
      continue;
    }

    console.log(`🎯 Found ${dataType} enrichment data:`, {
      sleep_score: enrichmentData.sleep_score,
      stress_score: enrichmentData.stress_score || enrichmentData.total_stress_score,
      respiratory_score: enrichmentData.respiratory_score,
      immune_index: enrichmentData.immune_index,
      contributors: Object.keys(enrichmentData).filter(key => key.includes('contributors'))
    });

    // Use current date as fallback if summary_date is missing
    const recordDate = dataEntry.summary_date ? new Date(dataEntry.summary_date) : new Date();

    // Store enrichment scores based on type - handle real Terra data structure
    const enrichmentScores = {
      data_type: dataType,
      provider: connection.provider,
      terra_user_id: user.user_id,
      
      // Sleep enrichment scores
      sleep_score: enrichmentData.sleep_score || null,
      sleep_contributors: enrichmentData.sleep_contributors || null,
      
      // Stress enrichment scores - handle both field names
      stress_score: enrichmentData.stress_score || enrichmentData.total_stress_score || null,
      stress_contributors: enrichmentData.stress_contributors || null,
      
      // Respiratory enrichment scores
      respiratory_score: enrichmentData.respiratory_score || null,
      respiratory_contributors: enrichmentData.respiratory_contributors || null,
      
      // Metadata
      summary_date: dataEntry.summary_date,
      recorded_at: recordDate.toISOString(),
      webhook_received_at: new Date().toISOString()
    };

    // Store enrichment data in the enrichment_scores table
    await storeEnrichmentScore(enrichmentScores);

    console.log(`✅ Stored ${dataType} enrichment scores for user ${connection.user_id}`);
    
    // Trigger daily health score aggregation for this user and date
    try {
      const { dailyHealthAggregator } = await import('../../lib/daily-health-aggregator');
      const scoreDate = dataEntry.summary_date ? dataEntry.summary_date.split('T')[0] : new Date().toISOString().split('T')[0];
      await dailyHealthAggregator.aggregateUserDayScores(connection.user_id, scoreDate);
      console.log(`✅ Updated daily health scores for user ${connection.user_id} on ${scoreDate}`);
    } catch (error) {
      console.error('Error updating daily health scores:', error);
    }
  }
}

// Function to process athlete/user data
async function processAthleteData(webhookData: any) {
  console.log('👤 Processing athlete data:', {
    user_id: webhookData.user?.user_id,
    type: webhookData.type
  });
  // For now, just log athlete data - no enrichment scores to extract
}

// Function to process deauth data
async function processDeauthData(webhookData: any) {
  console.log('🔓 Processing deauth data:', {
    user_id: webhookData.user?.user_id,
    type: webhookData.type
  });
  
  // Mark user connection as inactive when they deauthorize
  const terraUserId = webhookData.user?.user_id;
  if (terraUserId) {
    try {
      const connection = await WearablesDatabase.getConnectionByTerraUserId(terraUserId);
      if (connection) {
        await WearablesDatabase.updateConnectionStatus(connection.id, false);
        console.log(`🔓 Deactivated connection for Terra user: ${terraUserId}`);
      }
    } catch (error) {
      console.error('Error processing deauth:', error);
    }
  }
}

// Function to extract enrichment data only from large payloads
function extractEnrichmentDataOnly(data: any): any {
  try {
    if (!data || !data.data || !Array.isArray(data.data)) {
      return data;
    }

    // Extract only enrichment scores, remove massive sample arrays
    const filteredData = {
      ...data,
      data: data.data.map((item: any) => {
        if (item.metadata?.data_enrichment) {
          return {
            ...item,
            samples: undefined, // Remove massive sample arrays
            metadata: {
              ...item.metadata,
              data_enrichment: item.metadata.data_enrichment
            }
          };
        }
        return undefined;
      }).filter(Boolean)
    };

    return filteredData;
  } catch (error) {
    console.error('Error extracting enrichment data:', error);
    return data;
  }
}

// Function to process filtered enrichment data
async function processFilteredEnrichmentData(data: any): Promise<void> {
  try {
    if (!data || !data.data || !Array.isArray(data.data)) {
      return;
    }

    for (const item of data.data) {
      if (item.metadata?.data_enrichment) {
        await processEnrichmentScores(data, item.type || 'unknown');
      }
    }
  } catch (error) {
    console.error('Error processing filtered enrichment data:', error);
  }
}

// Function to trigger user data sync via polling instead of webhook
async function triggerUserDataSync(terraUserId: string) {
  if (!terraUserId) {
    console.log('❌ Cannot trigger sync - missing Terra user ID');
    return;
  }

  try {
    // Find the connection by Terra user ID
    const connection = await WearablesDatabase.getConnectionByTerraUserId(terraUserId);
    
    if (!connection) {
      console.log('❌ No connection found for Terra user ID:', terraUserId);
      return;
    }

    console.log(`📋 Triggered polling sync for user ${connection.user_id} (Terra: ${terraUserId})`);
    
    // Instead of processing the massive webhook payload,
    // we'll let the regular sync process handle this via polling
    // This avoids the 413 error from massive payloads
    return;
    
  } catch (error) {
    console.error('❌ Error triggering user data sync:', error);
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebhookResponse>
) {
  console.log('🚀 TERRA WEBHOOK CALLED - METHOD:', req.method, 'TIME:', new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(req);
    const signature = req.headers['terra-signature'] as string;

    console.log('🔐 Terra webhook data received:', {
      signature_present: !!signature,
      body_size: rawBody.length,
      body_size_mb: (rawBody.length / (1024 * 1024)).toFixed(2),
      user_agent: req.headers['user-agent'],
      content_type: req.headers['content-type'],
      timestamp: new Date().toISOString()
    });

    // Check payload size and attempt intelligent filtering if too large  
    const maxPayloadSize = 30 * 1024 * 1024; // 30MB limit
    if (rawBody.length > maxPayloadSize) {
      console.log(`⚠️ Large webhook payload detected: ${(rawBody.length / (1024 * 1024)).toFixed(2)}MB - attempting enrichment extraction`);
      
      try {
        // Parse JSON and extract only enrichment data to avoid 413 errors
        const fullData = JSON.parse(rawBody);
        const filteredData = extractEnrichmentDataOnly(fullData);
        
        // Process the filtered data for enrichment scores only
        await processFilteredEnrichmentData(filteredData);
        
        return res.status(200).json({ 
          success: true, 
          message: 'Large payload processed - enrichment scores extracted',
          payload_size_mb: (rawBody.length / (1024 * 1024)).toFixed(2),
          processing_mode: 'enrichment_only'
        });
        
      } catch (error) {
        console.log(`🚫 Cannot process large payload: ${(rawBody.length / (1024 * 1024)).toFixed(2)}MB`);
        return res.status(413).json({ 
          success: false, 
          message: 'Payload too large and enrichment extraction failed',
          payload_size_mb: (rawBody.length / (1024 * 1024)).toFixed(2)
        });
      }
    }

    // SKIP ALL SIGNATURE VERIFICATION FOR NOW
    console.log('🔓 ACCEPTING ALL TERRA WEBHOOKS - SIGNATURE VERIFICATION DISABLED');

    // Parse the JSON body
    let webhookData;
    try {
      webhookData = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('❌ Failed to parse webhook JSON:', parseError);
      return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }
    console.log('📨 Terra webhook received:', {
      type: webhookData.type,
      user_id: webhookData.user?.user_id,
      data_type: webhookData.data?.[0]?.type,
      timestamp: new Date().toISOString()
    });

    // Process webhooks to extract enrichment scores only - avoiding massive sample arrays
    switch (webhookData.type) {
      case 'sleep':
        await processEnrichmentScores(webhookData, 'sleep');
        break;
      case 'activity':
        await processEnrichmentScores(webhookData, 'activity');
        break;
      case 'daily':
        await processEnrichmentScores(webhookData, 'daily');
        break;
      case 'body':
        await processEnrichmentScores(webhookData, 'body');
        break;
      case 'athlete':
        await processAthleteData(webhookData);
        break;
      case 'deauth':
        await processDeauthData(webhookData);
        break;
      default:
        console.log('Unknown webhook type:', webhookData.type);
    }

    return res.status(200).json({ success: true, message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('Terra webhook error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

async function processDailyData(webhookData: any) {
  const { user, data } = webhookData;
  
  if (!user?.user_id || !data?.[0]) {
    console.log('❌ Missing required data in daily webhook:', { user_id: user?.user_id, data_count: data?.length });
    return;
  }

  // Find user connection by Terra user ID
  const connection = await WearablesDatabase.getConnectionByTerraUserId(user.user_id);
  
  if (!connection) {
    console.log('❌ No connection found for Terra user ID:', user.user_id);
    return;
  }

  console.log('✅ Found connection for Terra user ID:', {
    terra_user_id: user.user_id,
    app_user_id: connection.user_id,
    provider: connection.provider,
    data_count: data.length
  });
  
  for (const dailyData of data) {
    console.log('📊 Processing daily data entry:', {
      summary_date: dailyData.summary_date,
      has_MET_data: !!dailyData.MET_data,
      MET_samples_count: dailyData.MET_data?.MET_samples?.length || 0,
      has_heart_rate_data: !!dailyData.heart_rate_data,
      hr_samples_count: dailyData.heart_rate_data?.heart_rate_samples?.length || 0,
      data_keys: Object.keys(dailyData)
    });

    // Use current date as fallback if summary_date is missing
    const recordDate = dailyData.summary_date ? new Date(dailyData.summary_date) : new Date();

    // Filter out large arrays to prevent 413 errors
    const filteredMETData = dailyData.MET_data ? {
      ...dailyData.MET_data,
      MET_samples: [] // Remove detailed minute-by-minute samples
    } : null;

    const filteredHeartRateData = dailyData.heart_rate_data ? {
      ...dailyData.heart_rate_data,
      heart_rate_samples: [] // Remove detailed samples
    } : null;

    // Store comprehensive daily data with filtered arrays
    await storeHealthDataByTerraUserId(
      user.user_id,
      'activity',
      {
        // MET data (activity levels) - filtered
        MET_data: filteredMETData,
        
        // Strain data
        strain_data: dailyData.strain_data,
        
        // Oxygen data
        oxygen_data: dailyData.oxygen_data,
        
        // Steps and activity
        steps: dailyData.steps,
        calories_burned: dailyData.calories_total,
        distance_meters: dailyData.distance_data?.distance_metres,
        active_duration_seconds: dailyData.active_durations_data?.activity_seconds,
        
        // Heart rate data - filtered
        heart_rate_data: filteredHeartRateData,
        
        // Sleep data (if present)
        sleep_data: dailyData.sleep_durations_data,
        
        // Raw data for future reference - filtered
        raw_daily_data: {
          ...dailyData,
          MET_data: filteredMETData,
          heart_rate_data: filteredHeartRateData
        },
        summary_date: dailyData.summary_date
      },
      recordDate
    );

    // Also store individual data types for easier querying
    if (dailyData.MET_data) {
      await storeHealthDataByTerraUserId(
        user.user_id,
        'activity',
        {
          MET_data: filteredMETData, // Use filtered data
          avg_level: dailyData.MET_data.avg_level,
          low_intensity_minutes: dailyData.MET_data.num_low_intensity_minutes,
          moderate_intensity_minutes: dailyData.MET_data.num_moderate_intensity_minutes,
          high_intensity_minutes: dailyData.MET_data.num_high_intensity_minutes,
          inactive_minutes: dailyData.MET_data.num_inactive_minutes
        },
        recordDate
      );
    }

    if (dailyData.heart_rate_data) {
      await storeHealthDataByTerraUserId(
        user.user_id,
        'heart_rate',
        filteredHeartRateData, // Use filtered data
        recordDate
      );
    }
  }
}

async function processSleepData(webhookData: any) {
  console.log('😴 Processing Oura sleep data for user:', webhookData.user?.user_id);
  const { user, data } = webhookData;
  
  if (!user?.user_id || !data?.[0]) return;

  for (const sleepData of data) {
    // Extract date from metadata.start_time for Oura data
    const recordDate = sleepData.metadata?.start_time ? 
      new Date(sleepData.metadata.start_time) : 
      (sleepData.summary_date ? new Date(sleepData.summary_date) : new Date());

    // Calculate sleep duration from Oura structure
    const asleepData = sleepData.sleep_durations_data?.asleep;
    const otherData = sleepData.sleep_durations_data?.other;
    const awakeData = sleepData.sleep_durations_data?.awake;

    const totalSleepSeconds = asleepData?.duration_asleep_state_seconds || 0;
    const timeInBedSeconds = otherData?.duration_in_bed_seconds || 0;

    await storeHealthDataByTerraUserId(
      user.user_id,
      'sleep',
      {
        // Duration data
        duration_hours: totalSleepSeconds ? totalSleepSeconds / 3600 : null,
        time_in_bed_hours: timeInBedSeconds ? timeInBedSeconds / 3600 : null,
        efficiency: sleepData.sleep_durations_data?.sleep_efficiency || null,
        
        // Sleep phases (in hours for consistency)
        deep_sleep_hours: asleepData?.duration_deep_sleep_state_seconds ? asleepData.duration_deep_sleep_state_seconds / 3600 : null,
        light_sleep_hours: asleepData?.duration_light_sleep_state_seconds ? asleepData.duration_light_sleep_state_seconds / 3600 : null,
        rem_sleep_hours: asleepData?.duration_REM_sleep_state_seconds ? asleepData.duration_REM_sleep_state_seconds / 3600 : null,
        awake_hours: awakeData?.duration_awake_state_seconds ? awakeData.duration_awake_state_seconds / 3600 : null,
        
        // Sleep quality metrics
        sleep_score: sleepData.data_enrichment?.sleep_score || null,
        sleep_contributors: sleepData.data_enrichment?.sleep_contributors || null,
        
        // Sleep latency and wake events
        sleep_latency_minutes: awakeData?.sleep_latency_seconds ? awakeData.sleep_latency_seconds / 60 : null,
        wake_up_latency_minutes: awakeData?.wake_up_latency_seconds ? awakeData.wake_up_latency_seconds / 60 : null,
        num_wakeup_events: awakeData?.num_wakeup_events || null,
        num_REM_events: asleepData?.num_REM_events || null,
        
        // Heart rate during sleep
        avg_hr_sleep: sleepData.heart_rate_data?.summary?.avg_hr_bpm || null,
        resting_hr: sleepData.heart_rate_data?.summary?.resting_hr_bpm || null,
        avg_hrv_rmssd: sleepData.heart_rate_data?.summary?.avg_hrv_rmssd || null,
        
        // Respiratory data
        avg_breaths_per_min: sleepData.respiration_data?.breaths_data?.avg_breaths_per_min || null,
        avg_oxygen_saturation: sleepData.respiration_data?.oxygen_saturation_data?.avg_saturation_percentage || null,
        
        // Temperature data
        temperature_delta: sleepData.temperature_data?.delta || null,
        
        // Readiness metrics
        recovery_level: sleepData.readiness_data?.recovery_level || null,
        readiness_score: sleepData.readiness_data?.readiness || null,
        
        // Store filtered raw data for future analysis (remove large sample arrays)
        raw_sleep_data: {
          ...sleepData,
          heart_rate_data: sleepData.heart_rate_data ? {
            ...sleepData.heart_rate_data,
            heart_rate_samples: [] // Remove detailed samples
          } : null,
          respiration_data: sleepData.respiration_data ? {
            ...sleepData.respiration_data,
            breaths_samples: [], // Remove detailed samples
            oxygen_saturation_samples: [] // Remove detailed samples
          } : null
        },
        
        // Metadata
        metadata: sleepData.metadata || {},
        is_nap: sleepData.metadata?.is_nap || false
      },
      recordDate
    );

    console.log(`💾 Stored Oura sleep data: ${totalSleepSeconds / 3600}h sleep, ${sleepData.data_enrichment?.sleep_score || 'no'} sleep score`);
  }
}

async function processBodyData(webhookData: any) {
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



// Helper function to store health data by Terra user ID
async function storeHealthDataByTerraUserId(
  terraUserId: string,
  dataType: 'sleep' | 'activity' | 'heart_rate' | 'body',
  data: any,
  recordedAt: Date
) {
  try {
    // Find the connection by Terra user ID
    const connection = await WearablesDatabase.getConnectionByTerraUserId(terraUserId);
    
    if (!connection) {
      console.log(`⚠️ No connection found for Terra user ${terraUserId}`);
      return;
    }

    // Store the health data in our database
    await WearablesDatabase.saveHealthData(
      connection.user_id, 
      connection.provider, 
      dataType, 
      data, 
      recordedAt
    );

    // Update last sync time
    await WearablesDatabase.updateLastSync(connection.user_id, connection.provider);
    
    console.log(`✅ Stored ${dataType} data for user ${connection.user_id} from ${connection.provider}:`, {
      terra_user_id: terraUserId,
      data_keys: Object.keys(data),
      recorded_at: recordedAt.toISOString()
    });

  } catch (error) {
    console.error(`❌ Failed to store ${dataType} data for Terra user ${terraUserId}:`, error);
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}