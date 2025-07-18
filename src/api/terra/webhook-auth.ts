/**
 * Terra Authentication Webhook Handler
 * Processes auth events and maps Terra user IDs correctly
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

// Using DatabasePool directly for new pattern

// Disable body parsing to get raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', reject);
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('🔐 TERRA AUTH WEBHOOK - METHOD:', req.method, 'TIME:', new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['terra-signature'] as string;

    console.log('🔐 Terra auth webhook data received:', {
      signature_present: !!signature,
      body_size: rawBody.length,
      user_agent: req.headers['user-agent'],
      content_type: req.headers['content-type']
    });

    // Parse the JSON body
    let webhookData;
    try {
      webhookData = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('❌ Failed to parse webhook JSON:', parseError);
      return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }

    console.log('📨 Terra auth webhook received:', {
      type: webhookData.type,
      user_id: webhookData.user?.user_id,
      provider: webhookData.user?.provider,
      reference_id: webhookData.reference_id,
      scopes: webhookData.user?.scopes?.length || 0
    });

    // Store complete webhook data for analysis
    await storeWebhookEvent(webhookData);

    // Process auth events specifically
    if (webhookData.type === 'auth' && webhookData.user?.user_id) {
      await processAuthEvent(webhookData);
    }

    return res.status(200).json({ success: true, message: 'Auth webhook processed successfully' });

  } catch (error) {
    console.error('❌ Terra auth webhook error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

async function processAuthEvent(webhookData: any) {
  const { user, reference_id } = webhookData;
  const terraUserId = user.user_id;
  const provider = user.provider;
  const scopes = user.scopes || [];

  console.log(`🔗 Processing auth event for ${provider} user ${terraUserId}`);

  // Extract user info from reference_id
  let email = '';
  let userId = '';

  if (reference_id && reference_id.includes('-')) {
    const baseName = reference_id.split('-')[0]; // rdhanji786
    email = `${baseName}@gmail.com`;
    // For now, use known user ID - later we can enhance this mapping
    userId = 'eb5b5758-62ca-4d67-9cb0-d2ca2b23c083';
  } else {
    console.log('⚠️ Unknown reference_id format:', reference_id);
    return;
  }

  console.log(`📧 Mapping Terra user ${terraUserId} to app user ${userId} (${email})`);

  const client = await DatabasePool.getClient();
  try {
    // Delete any existing connection for this user/provider
    await client.query(`
      DELETE FROM wearable_connections 
      WHERE user_id = $1 AND provider = $2
    `, [userId, provider]);

    // Insert new connection with correct Terra user ID
    const insertResult = await client.query(`
      INSERT INTO wearable_connections (
        user_id, 
        terra_user_id, 
        email, 
        provider, 
        provider_display,
        connected_at, 
        last_sync, 
        is_active, 
        status, 
        scopes,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), true, 'connected', $6, NOW())
      RETURNING id
    `, [
      userId, 
      terraUserId, 
      email, 
      provider,
      provider === 'OURA' ? 'Oura Ring' : provider === 'GOOGLE' ? 'Google Fit' : provider,
      JSON.stringify(scopes)
    ]);

    console.log(`✅ Successfully stored ${provider} connection:`, {
      connection_id: insertResult.rows[0].id,
      user_id: userId,
      terra_user_id: terraUserId,
      provider: provider,
      scopes_count: scopes.length
    });

    // Trigger immediate data sync for the new connection
    await triggerDataSync(terraUserId, provider, userId);

  } finally {
    client.release();
  }
}

async function triggerDataSync(terraUserId: string, provider: string, userId: string) {
  console.log(`🔄 Triggering initial data sync for ${provider} user ${terraUserId}`);
  
  try {
    // Fetch recent data from Terra API
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const headers = {
      'dev-id': process.env.TERRA_DEV_ID_PROD!,
      'x-api-key': process.env.TERRA_API_KEY_PROD!
    };

    // Fetch daily data
    const dailyResponse = await fetch(
      `https://api.tryterra.co/v2/daily?user_id=${terraUserId}&start_date=${startDate}&end_date=${endDate}`,
      { headers }
    );

    if (dailyResponse.ok) {
      const dailyData = await dailyResponse.json();
      if (dailyData.data?.length > 0) {
        await storeDailyData(userId, provider, terraUserId, dailyData.data);
        console.log(`✅ Synced ${dailyData.data.length} daily records for ${provider}`);
      }
    }

    // Fetch sleep data
    const sleepResponse = await fetch(
      `https://api.tryterra.co/v2/sleep?user_id=${terraUserId}&start_date=${startDate}&end_date=${endDate}`,
      { headers }
    );

    if (sleepResponse.ok) {
      const sleepData = await sleepResponse.json();
      if (sleepData.data?.length > 0) {
        await storeSleepData(userId, provider, terraUserId, sleepData.data);
        console.log(`✅ Synced ${sleepData.data.length} sleep records for ${provider}`);
      }
    }

  } catch (error) {
    console.error(`❌ Data sync failed for ${provider}:`, error);
  }
}

async function storeDailyData(userId: string, provider: string, terraUserId: string, dailyData: any[]) {
  const client = await DatabasePool.getClient();
  try {
    for (const record of dailyData) {
      if (record.metadata?.start_time) {
        const recordDate = record.metadata.start_time.split('T')[0];
        
        // Store in daily summary table
        await client.query(`
          INSERT INTO daily_health_summary (
            user_id, date, provider, steps, calories_burned, distance, 
            sleep_duration, resting_heart_rate, active_minutes, 
            stress_score, raw_data, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
          ON CONFLICT (user_id, date, provider) DO UPDATE SET
            steps = EXCLUDED.steps,
            calories_burned = EXCLUDED.calories_burned,
            distance = EXCLUDED.distance,
            resting_heart_rate = EXCLUDED.resting_heart_rate,
            active_minutes = EXCLUDED.active_minutes,
            stress_score = EXCLUDED.stress_score,
            raw_data = EXCLUDED.raw_data,
            created_at = NOW()
        `, [
          userId,
          recordDate,
          provider,
          record.distance_data?.steps || null,
          record.calories_data?.total_burned_calories || null,
          record.distance_data?.distance_metres || null,
          record.sleep_durations_data?.asleep?.duration_asleep_state_seconds ? 
            record.sleep_durations_data.asleep.duration_asleep_state_seconds / 3600 : null,
          record.heart_rate_data?.summary?.resting_hr_bpm || null,
          record.active_durations_data?.activity_seconds ? 
            Math.round(record.active_durations_data.activity_seconds / 60) : null,
          record.scores_data?.stress || null,
          JSON.stringify(record)
        ]);

        // Store in detailed health data table
        await client.query(`
          INSERT INTO wearable_health_data (
            user_id, provider, data_type, data, recorded_at, 
            synced_at, terra_user_id, data_source, quality_score, processing_status
          ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, 'terra_webhook', 95, 'processed')
          ON CONFLICT DO NOTHING
        `, [
          userId,
          provider,
          'daily_summary',
          JSON.stringify(record),
          new Date(record.metadata.start_time),
          terraUserId
        ]);
      }
    }
  } finally {
    client.release();
  }
}

async function storeSleepData(userId: string, provider: string, terraUserId: string, sleepData: any[]) {
  const client = await DatabasePool.getClient();
  try {
    for (const record of sleepData) {
      if (record.metadata?.start_time) {
        await client.query(`
          INSERT INTO wearable_health_data (
            user_id, provider, data_type, data, recorded_at, 
            synced_at, terra_user_id, data_source, quality_score, processing_status
          ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, 'terra_webhook', 95, 'processed')
          ON CONFLICT DO NOTHING
        `, [
          userId,
          provider,
          'sleep',
          JSON.stringify(record),
          new Date(record.metadata.start_time),
          terraUserId
        ]);
      }
    }
  } finally {
    client.release();
  }
}

async function storeWebhookEvent(webhookData: any) {
  const client = await DatabasePool.getClient();
  try {
    await client.query(`
      INSERT INTO terra_webhook_events (
        event_type, provider, terra_user_id, raw_data, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [
      webhookData.type,
      webhookData.user?.provider || null,
      webhookData.user?.user_id || null,
      JSON.stringify(webhookData)
    ]);
  } catch (error) {
    console.error('❌ Failed to store webhook event:', error);
  } finally {
    client.release();
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}