import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

/**
 * @deprecated This endpoint is deprecated. Use /api/terra/data?data_type=google_fit&days_back=7 instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pool = DatabasePool.getInstance();
  
  try {
    console.log('🔍 Checking Google Fit data for recent days...');

    // Get last 7 days of data
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    console.log('📅 Date range:', {
      start: sevenDaysAgo.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0]
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
      connected_days_ago: Math.floor((new Date().getTime() - new Date(connection.connected_at).getTime()) / (1000 * 60 * 60 * 24))
    });

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

    // Check each of the last 7 days
    const dailyDataResults = [];
    
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];
      
      console.log(`🌍 Checking data for ${dateStr}...`);

      // Get activity data for this specific day
      const activityUrl = `https://api.tryterra.co/v2/activity?user_id=${terraUserId}&start_date=${dateStr}&end_date=${dateStr}`;
      
      const activityResponse = await fetch(activityUrl, {
        method: 'GET',
        headers: {
          'dev-id': process.env.TERRA_DEV_ID!,
          'x-api-key': terraApiKey,
          'Content-Type': 'application/json'
        }
      });

      const activityData = await activityResponse.json();
      
      const dayData = {
        date: dateStr,
        day_name: checkDate.toLocaleDateString('en-US', { weekday: 'long' }),
        data_available: activityData?.data?.length > 0,
        data_count: activityData?.data?.length || 0,
        sample_data: activityData?.data?.[0] || null
      };

      // Extract metrics if available
      if (activityData?.data?.[0]) {
        const activity = activityData.data[0];
        const metrics = {
          steps: activity.steps_data?.steps || activity.summary?.steps || null,
          calories: activity.calories_data?.total_burned || activity.summary?.calories || null,
          distance: activity.distance_data?.distance_meters || activity.summary?.distance_meters || null,
          heart_rate: activity.heart_rate_data?.avg_hr_bpm || activity.summary?.avg_hr_bpm || null,
          active_minutes: activity.active_durations_data?.activity_seconds ? Math.round(activity.active_durations_data.activity_seconds / 60) : null
        };
        Object.assign(dayData, { metrics });
      }

      dailyDataResults.push(dayData);
      console.log(`📊 ${dateStr}: ${dayData.data_count} records found`);
    }

    // Find the most recent day with data
    const mostRecentDataDay = dailyDataResults.find(day => day.data_available);
    
    // Calculate summary statistics
    const totalDaysWithData = dailyDataResults.filter(day => day.data_available).length;
    const totalDataPoints = dailyDataResults.reduce((sum, day) => sum + day.data_count, 0);

    const summary = {
      connection_status: 'active',
      days_checked: 7,
      days_with_data: totalDaysWithData,
      total_data_points: totalDataPoints,
      most_recent_data_date: mostRecentDataDay?.date || null,
      most_recent_data_day: mostRecentDataDay?.day_name || null,
      data_freshness: mostRecentDataDay ? 
        Math.floor((new Date().getTime() - new Date(mostRecentDataDay.date).getTime()) / (1000 * 60 * 60 * 24)) + ' days ago' : 
        'No recent data found',
      latest_metrics: (mostRecentDataDay as any)?.metrics || null
    };

    console.log('📋 Weekly summary:', summary);

    return res.status(200).json({
      success: true,
      summary,
      connection_info: {
        provider: connection.provider,
        connected_at: connection.connected_at,
        last_sync: connection.last_sync,
        scopes_count: connection.scopes ? connection.scopes.split(',').length : 0,
        has_fitness_scopes: connection.scopes ? connection.scopes.includes('fitness.activity.read') : false
      },
      daily_breakdown: dailyDataResults,
      recommendations: totalDaysWithData === 0 ? [
        'Google Fit may need time to sync data after connection',
        'Try opening Google Fit app and manually syncing',
        'Check if step tracking is enabled in Google Fit settings',
        'Ensure your device is actively tracking fitness data'
      ] : [
        `Most recent data available: ${mostRecentDataDay?.date}`,
        'Connection appears to be working correctly',
        'Data may take 1-2 days to appear in Terra API after activity'
      ]
    });

  } catch (error) {
    console.error('❌ Error checking Google Fit recent data:', error);
    return res.status(500).json({
      error: 'Failed to check Google Fit recent data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}