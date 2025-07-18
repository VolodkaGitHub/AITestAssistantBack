/**
 * Terra Webhook Handler
 * Processes Terra API webhooks for auth callbacks and data updates
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { terraClient } from '../../lib/terra-client';
import { WearablesDatabase } from '../../lib/wearables-database';

interface TerraWebhookAuth {
  type: 'auth';
  user: {
    user_id: string;
    provider: string;
    scopes: string;
    reference_id: string;
  };
}

interface TerraWebhookData {
  type: 'activity' | 'sleep' | 'body' | 'daily';
  user: {
    user_id: string;
    provider: string;
  };
  data: any[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = JSON.stringify(req.body);
    const signature = req.headers['terra-signature'] as string;

    // Verify webhook signature
    if (!terraClient.verifyWebhookSignature(payload, signature)) {
      console.error('Invalid Terra webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const webhookData = req.body;
    console.log('📥 Terra webhook received:', webhookData.type, webhookData.user?.provider);

    // Handle authentication webhook
    if (webhookData.type === 'auth') {
      const authData = webhookData as TerraWebhookAuth;
      
      try {
        // The reference_id should contain our user's ID
        const ourUserId = authData.user.reference_id;
        const terraUserId = authData.user.user_id;
        const provider = authData.user.provider;
        const scopes = authData.user.scopes.split(',');

        console.log(`🔐 Terra auth success: ${provider} connected for user ${ourUserId}`);
        console.log(`📱 Terra user ID: ${terraUserId}`);
        console.log(`🔍 Scopes: ${scopes.join(', ')}`);

        // Save the connection to our database
        await WearablesDatabase.saveConnection(
          ourUserId,
          provider,
          terraUserId,
          scopes
        );

        console.log(`✅ Saved Terra connection: ${provider} → ${terraUserId}`);

      } catch (error) {
        console.error('Error handling Terra auth webhook:', error);
      }
    }

    // Handle data webhooks
    else if (['activity', 'sleep', 'body', 'daily'].includes(webhookData.type)) {
      const dataWebhook = webhookData as TerraWebhookData;
      
      try {
        // Find the connection in our database
        const connection = await WearablesDatabase.getConnectionByTerraUserId(
          dataWebhook.user.user_id
        );

        if (!connection) {
          console.warn(`🚫 No connection found for Terra user ${dataWebhook.user.user_id}`);
          return res.status(200).json({ message: 'No connection found' });
        }

        console.log(`📊 Processing ${webhookData.type} data for ${connection.provider}`);

        // Process the comprehensive Terra daily data payload
        for (const item of dataWebhook.data) {
          const recordedDate = item.metadata?.start_time || item.metadata?.end_time || new Date().toISOString();
          
          if (recordedDate) {
            // Extract comprehensive health metrics
            const comprehensiveData = {
              // Raw Terra payload for full data retention
              raw_data: item,
              
              // Structured health metrics
              calories: {
                bmr_calories: item.calories_data?.BMR_calories,
                total_burned: item.calories_data?.total_burned_calories,
                net_activity: item.calories_data?.net_activity_calories,
                net_intake: item.calories_data?.net_intake_calories
              },
              
              heart_rate: {
                avg_bpm: item.heart_rate_data?.summary?.avg_hr_bpm,
                resting_bpm: item.heart_rate_data?.summary?.resting_hr_bpm,
                max_bpm: item.heart_rate_data?.summary?.max_hr_bpm,
                min_bpm: item.heart_rate_data?.summary?.min_hr_bpm,
                user_max_bpm: item.heart_rate_data?.summary?.user_max_hr_bpm,
                avg_hrv_rmssd: item.heart_rate_data?.summary?.avg_hrv_rmssd,
                avg_hrv_sdnn: item.heart_rate_data?.summary?.avg_hrv_sdnn,
                detailed_samples: item.heart_rate_data?.detailed
              },
              
              activity: {
                steps: item.distance_data?.steps,
                distance_meters: item.distance_data?.distance_meters,
                floors_climbed: item.distance_data?.floors_climbed,
                elevation_gain: item.distance_data?.elevation?.gain_actual_meters,
                active_duration: item.active_durations_data?.activity_seconds,
                low_intensity_seconds: item.active_durations_data?.low_intensity_seconds,
                moderate_intensity_seconds: item.active_durations_data?.moderate_intensity_seconds,
                vigorous_intensity_seconds: item.active_durations_data?.vigorous_intensity_seconds,
                inactivity_seconds: item.active_durations_data?.inactivity_seconds
              },
              
              met_data: {
                avg_level: item.MET_data?.avg_level,
                high_intensity_minutes: item.MET_data?.num_high_intensity_minutes,
                moderate_intensity_minutes: item.MET_data?.num_moderate_intensity_minutes,
                low_intensity_minutes: item.MET_data?.num_low_intensity_minutes,
                inactive_minutes: item.MET_data?.num_inactive_minutes,
                samples: item.MET_data?.MET_samples
              },
              
              oxygen: {
                vo2_max: item.oxygen_data?.vo2max_ml_per_min_per_kg,
                avg_saturation: item.oxygen_data?.avg_saturation_percentage,
                vo2_samples: item.oxygen_data?.vo2_samples,
                saturation_samples: item.oxygen_data?.saturation_samples
              },
              
              stress: {
                avg_level: item.stress_data?.avg_stress_level,
                max_level: item.stress_data?.max_stress_level,
                high_stress_duration: item.stress_data?.high_stress_duration_seconds,
                medium_stress_duration: item.stress_data?.medium_stress_duration_seconds,
                low_stress_duration: item.stress_data?.low_stress_duration_seconds,
                samples: item.stress_data?.samples
              },
              
              scores: {
                recovery: item.scores?.recovery,
                activity: item.scores?.activity,
                sleep: item.scores?.sleep
              },
              
              strain: {
                level: item.strain_data?.strain_level
              },
              
              swimming: item.distance_data?.swimming,
              
              tags: item.tag_data?.tags || [],
              
              device_info: item.device_data,
              
              enrichment: item.data_enrichment,
              
              metadata: {
                start_time: item.metadata?.start_time,
                end_time: item.metadata?.end_time,
                upload_type: item.metadata?.upload_type,
                timestamp_localization: item.metadata?.timestamp_localization
              }
            };

            // Save comprehensive daily data
            await WearablesDatabase.saveHealthData(
              connection.user_id,
              connection.provider,
              'daily_comprehensive',
              comprehensiveData,
              new Date(recordedDate)
            );

            console.log(`📊 Saved comprehensive daily data for ${connection.provider}:`, {
              steps: comprehensiveData.activity.steps,
              calories: comprehensiveData.calories.total_burned,
              heart_rate: comprehensiveData.heart_rate.avg_bpm,
              scores: comprehensiveData.scores
            });
          }
        }

        // Update last sync time
        await WearablesDatabase.updateLastSync(connection.user_id, connection.provider);

        console.log(`✅ Processed ${dataWebhook.data.length} ${webhookData.type} records`);

      } catch (error) {
        console.error(`Error processing Terra ${webhookData.type} webhook:`, error);
      }
    }

    return res.status(200).json({ message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('Terra webhook error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Webhook processing failed' 
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}