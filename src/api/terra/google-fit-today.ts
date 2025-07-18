import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

/**
 * @deprecated This endpoint is deprecated. Use /api/terra/data?data_type=google_fit&days_back=1 instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pool = DatabasePool.getInstance();
  
  try {
    console.log('🔍 Checking Google Fit data for today...');

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    console.log('📅 Date range:', {
      start: startOfDay.toISOString(),
      end: endOfDay.toISOString()
    });

    // Get Google Fit connection
    const connectionQuery = `
      SELECT * FROM wearable_connections 
      WHERE provider = 'GOOGLE' AND is_active = true
      ORDER BY connected_at DESC LIMIT 1
    `;
    
    const connectionResult = await pool.query(connectionQuery);
    
    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No active Google Fit connection found' 
      });
    }

    const connection = connectionResult.rows[0];
    console.log('🔗 Found Google connection:', {
      id: connection.id,
      provider: connection.provider,
      last_sync: connection.last_sync,
      scopes: connection.scopes
    });

    // Direct Terra API call for today's activity data
    const terraApiKey = process.env.TERRA_API_KEY;
    const terraUserId = connection.terra_user_id;

    if (!terraApiKey || !terraUserId) {
      return res.status(500).json({ 
        error: 'Missing Terra API configuration',
        details: {
          hasApiKey: !!terraApiKey,
          hasUserId: !!terraUserId
        }
      });
    }

    console.log('🌍 Making Terra API call for user:', terraUserId);

    // Get activity data from Terra API
    const activityUrl = `https://api.tryterra.co/v2/activity?user_id=${terraUserId}&start_date=${startOfDay.toISOString().split('T')[0]}&end_date=${endOfDay.toISOString().split('T')[0]}`;
    
    const activityResponse = await fetch(activityUrl, {
      method: 'GET',
      headers: {
        'dev-id': process.env.TERRA_DEV_ID!,
        'x-api-key': terraApiKey,
        'Content-Type': 'application/json'
      }
    });

    const activityData = await activityResponse.json();
    console.log('📊 Activity API response:', {
      status: activityResponse.status,
      dataCount: activityData?.data?.length || 0,
      sample: activityData?.data?.[0] || null
    });

    // Get body data from Terra API  
    const bodyUrl = `https://api.tryterra.co/v2/body?user_id=${terraUserId}&start_date=${startOfDay.toISOString().split('T')[0]}&end_date=${endOfDay.toISOString().split('T')[0]}`;
    
    const bodyResponse = await fetch(bodyUrl, {
      method: 'GET',
      headers: {
        'dev-id': process.env.TERRA_DEV_ID!,
        'x-api-key': terraApiKey,
        'Content-Type': 'application/json'
      }
    });

    const bodyData = await bodyResponse.json();
    console.log('⚖️ Body API response:', {
      status: bodyResponse.status,
      dataCount: bodyData?.data?.length || 0,
      sample: bodyData?.data?.[0] || null
    });

    // Get sleep data from Terra API
    const sleepUrl = `https://api.tryterra.co/v2/sleep?user_id=${terraUserId}&start_date=${startOfDay.toISOString().split('T')[0]}&end_date=${endOfDay.toISOString().split('T')[0]}`;
    
    const sleepResponse = await fetch(sleepUrl, {
      method: 'GET',
      headers: {
        'dev-id': process.env.TERRA_DEV_ID!,
        'x-api-key': terraApiKey,
        'Content-Type': 'application/json'
      }
    });

    const sleepData = await sleepResponse.json();
    console.log('😴 Sleep API response:', {
      status: sleepResponse.status,
      dataCount: sleepData?.data?.length || 0,
      sample: sleepData?.data?.[0] || null
    });

    // Compile today's data summary
    const todaysData = {
      date: today.toISOString().split('T')[0],
      connection: {
        provider: connection.provider,
        connected_at: connection.connected_at,
        last_sync: connection.last_sync,
        scopes: connection.scopes
      },
      activity: {
        api_status: activityResponse.status,
        data_count: activityData?.data?.length || 0,
        data: activityData?.data || [],
        raw_response: activityData
      },
      body: {
        api_status: bodyResponse.status,
        data_count: bodyData?.data?.length || 0,
        data: bodyData?.data || [],
        raw_response: bodyData
      },
      sleep: {
        api_status: sleepResponse.status,
        data_count: sleepData?.data?.length || 0,
        data: sleepData?.data || [],
        raw_response: sleepData
      }
    };

    // Extract key metrics for today if available
    const summary = {
      steps: null as number | null,
      calories: null as number | null,
      distance: null as number | null,
      heart_rate: null as number | null,
      sleep_hours: null as number | null,
      weight: null as number | null
    };

    // Extract activity metrics
    if (activityData?.data?.[0]) {
      const activity = activityData.data[0];
      summary.steps = activity.steps_data?.steps || activity.summary?.steps || null;
      summary.calories = activity.calories_data?.total_burned || activity.summary?.calories || null;
      summary.distance = activity.distance_data?.distance_meters || activity.summary?.distance_meters || null;
      summary.heart_rate = activity.heart_rate_data?.avg_hr_bpm || activity.summary?.avg_hr_bpm || null;
    }

    // Extract body metrics
    if (bodyData?.data?.[0]) {
      const body = bodyData.data[0];
      summary.weight = body.body_data?.weight_kg || body.summary?.weight_kg || null;
    }

    // Extract sleep metrics
    if (sleepData?.data?.[0]) {
      const sleep = sleepData.data[0];
      summary.sleep_hours = sleep.sleep_durations_data?.total_sleep_duration_seconds 
        ? sleep.sleep_durations_data.total_sleep_duration_seconds / 3600 
        : null;
    }

    console.log('📋 Today\'s summary:', summary);

    return res.status(200).json({
      success: true,
      date: today.toISOString().split('T')[0],
      summary,
      full_data: todaysData,
      message: `Retrieved Google Fit data for ${today.toDateString()}`
    });

  } catch (error) {
    console.error('❌ Error checking Google Fit data:', error);
    return res.status(500).json({
      error: 'Failed to check Google Fit data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}