/**
 * Terra Unified Data API Endpoint
 * Consolidated data access for all Terra wearable information
 * 
 * Supports:
 * - Activity data (steps, calories, distance)
 * - Sleep data (phases, quality, duration)
 * - Heart rate and physiological data
 * - Body composition data
 * - Google Fit specific endpoints
 * - Data freshness and status
 * 
 * Replaces: google-fit-recent, google-fit-today, data-freshness, 
 * enrichment-by-device, enrichment-status
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { terraClient } from '../../lib/terra-client';
import { WearablesDatabase } from '../../lib/wearables-database';
import { validateSessionToken } from '../../lib/auth-database';
import { DatabasePool } from '../../lib/database-pool'

interface DataRequest {
  data_type?: 'activity' | 'sleep' | 'heart_rate' | 'body' | 'all' | 'freshness' | 'google_fit';
  provider?: string;
  terra_user_id?: string;
  start_date?: string;
  end_date?: string;
  days_back?: number;
  include_raw?: boolean;
  format?: 'summary' | 'detailed' | 'raw';
}

interface DataResponse {
  success: boolean;
  data?: any;
  message?: string;
  metadata?: {
    provider?: string;
    data_type?: string;
    date_range?: {
      start: string;
      end: string;
    };
    records_count?: number;
    last_updated?: string;
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DataResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const {
      data_type = 'all',
      provider,
      terra_user_id,
      start_date,
      end_date,
      days_back = 7,
      include_raw = false,
      format = 'summary'
    }: DataRequest = req.query;

    // Validate user session
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const sessionToken = authHeader.substring(7);
    const user = await validateSessionToken(sessionToken);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid session' });
    }

    // Calculate date range
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Route to specific data handlers
    switch (data_type) {
      case 'freshness':
        return await handleDataFreshness(user.id, res, provider);
      
      case 'google_fit':
        return await handleGoogleFitData(user.id, res, startDate, endDate, format);
      
      case 'activity':
        return await handleActivityData(user.id, res, provider, terra_user_id, startDate, endDate, format);
      
      case 'sleep':
        return await handleSleepData(user.id, res, provider, terra_user_id, startDate, endDate, format);
      
      case 'heart_rate':
        return await handleHeartRateData(user.id, res, provider, terra_user_id, startDate, endDate, format);
      
      case 'body':
        return await handleBodyData(user.id, res, provider, terra_user_id, startDate, endDate, format);
      
      case 'all':
      default:
        return await handleAllData(user.id, res, provider, startDate, endDate, format, include_raw);
    }

  } catch (error) {
    console.error('Unified data API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wearable data'
    });
  }
}

// Data freshness handler
async function handleDataFreshness(userId: string, res: NextApiResponse<DataResponse>, provider?: string) {
  const dbPool = DatabasePool.getInstance();
  const client = await DatabasePool.getClient();
  
  try {
    let query = `
      SELECT 
        provider,
        terra_user_id,
        last_sync,
        status,
        COUNT(*) as connection_count
      FROM wearable_connections 
      WHERE user_id = $1 AND status = 'active'
    `;
    
    const params = [userId];
    
    if (provider) {
      query += ` AND provider = $2`;
      params.push(provider);
    }
    
    query += ` GROUP BY provider, terra_user_id, last_sync, status ORDER BY last_sync DESC`;
    
    const connectionsResult = await client.query(query, params);
    const connections = connectionsResult.rows;

    // Get recent data counts
    const dataCountQuery = `
      SELECT 
        provider,
        COUNT(*) as data_points,
        MAX(created_at) as latest_data,
        MIN(created_at) as oldest_data
      FROM health_data 
      WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY provider
    `;
    
    const dataResult = await client.query(dataCountQuery, [userId]);
    const dataStats = dataResult.rows;

    const freshnessData = connections.map((conn: any) => {
      const stats = dataStats.find((d: any) => d.provider === conn.provider) || {};
      const lastSync = conn.last_sync ? new Date(conn.last_sync) : null;
      const now = new Date();
      
      let freshness = 'unknown';
      if (lastSync) {
        const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync < 1) freshness = 'fresh';
        else if (hoursSinceSync < 6) freshness = 'recent';
        else if (hoursSinceSync < 24) freshness = 'stale';
        else freshness = 'old';
      }

      return {
        provider: conn.provider,
        terra_user_id: conn.terra_user_id,
        status: conn.status,
        last_sync: conn.last_sync,
        freshness: freshness,
        data_points: parseInt(stats.data_points) || 0,
        latest_data: stats.latest_data,
        oldest_data: stats.oldest_data
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        connections: freshnessData,
        summary: {
          total_connections: connections.length,
          fresh_connections: freshnessData.filter((d: any) => d.freshness === 'fresh').length,
          total_data_points: dataStats.reduce((sum: any, d: any) => sum + parseInt(d.data_points), 0),
          oldest_sync: connections.length > 0 ? Math.min(...connections.map((c: any) => new Date(c.last_sync || 0).getTime())) : null
        }
      },
      metadata: {
        data_type: 'freshness',
        date_range: { start: 'last_30_days', end: 'now' },
        last_updated: new Date().toISOString()
      }
    });

  } finally {
    client.release();
  }
}

// Google Fit specific data handler
async function handleGoogleFitData(userId: string, res: NextApiResponse<DataResponse>, startDate: string, endDate: string, format: string) {
  const connections = await WearablesDatabase.getUserConnections(userId);
  const googleFitConnection = connections.find(c => c.provider === 'google_fit');

  if (!googleFitConnection) {
    return res.status(200).json({
      success: true,
      data: { message: 'Google Fit not connected' },
      metadata: { provider: 'google_fit', data_type: 'all' }
    });
  }

  try {
    // Fetch Google Fit data
    const [activityData, sleepData] = await Promise.allSettled([
      terraClient.getActivityData(googleFitConnection.terra_user_id, startDate, endDate),
      terraClient.getSleepData(googleFitConnection.terra_user_id, startDate, endDate)
    ]);

    const activity = activityData.status === 'fulfilled' ? activityData.value : [];
    const sleep = sleepData.status === 'fulfilled' ? sleepData.value : [];

    const responseData = format === 'summary' ? {
      provider: 'google_fit',
      date_range: { start: startDate, end: endDate },
      summary: {
        activity: {
          total_steps: activity.reduce((sum: number, d: any) => sum + (d.steps || 0), 0),
          total_calories: activity.reduce((sum: number, d: any) => sum + (d.calories || 0), 0),
          days_with_data: activity.length
        },
        sleep: {
          total_sleep_hours: sleep.reduce((sum: number, d: any) => sum + (d.duration_hours || 0), 0),
          average_sleep_score: sleep.length > 0 ? sleep.reduce((sum: number, d: any) => sum + (d.score || 0), 0) / sleep.length : 0,
          nights_tracked: sleep.length
        }
      }
    } : {
      provider: 'google_fit',
      activity_data: activity,
      sleep_data: sleep,
      date_range: { start: startDate, end: endDate }
    };

    return res.status(200).json({
      success: true,
      data: responseData,
      metadata: {
        provider: 'google_fit',
        data_type: 'all',
        date_range: { start: startDate, end: endDate },
        records_count: activity.length + sleep.length,
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Google Fit data error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Google Fit data'
    });
  }
}

// Activity data handler
async function handleActivityData(userId: string, res: NextApiResponse<DataResponse>, provider?: string, terraUserId?: string, startDate?: string, endDate?: string, format?: string) {
  const connections = await WearablesDatabase.getUserConnections(userId);
  
  const targetConnections = provider 
    ? connections.filter(c => c.provider === provider)
    : terraUserId 
    ? connections.filter(c => c.terra_user_id === terraUserId)
    : connections;

  if (targetConnections.length === 0) {
    return res.status(200).json({
      success: true,
      data: { activities: [], message: 'No connections found' }
    });
  }

  const allActivityData: any[] = [];

  for (const connection of targetConnections) {
    try {
      const activityData = await terraClient.getActivityData(connection.terra_user_id, startDate!, endDate!);
      allActivityData.push(...activityData.map((d: any) => ({ ...d, provider: connection.provider })));
    } catch (error) {
      console.warn(`Activity data failed for ${connection.provider}:`, error);
    }
  }

  const responseData = format === 'summary' ? {
    total_activities: allActivityData.length,
    total_steps: allActivityData.reduce((sum, d) => sum + (d.steps || 0), 0),
    total_calories: allActivityData.reduce((sum, d) => sum + (d.calories || 0), 0),
    providers: [...new Set(allActivityData.map(d => d.provider))]
  } : {
    activities: allActivityData,
    count: allActivityData.length
  };

  return res.status(200).json({
    success: true,
    data: responseData,
    metadata: {
      data_type: 'activity',
      date_range: { start: startDate!, end: endDate! },
      records_count: allActivityData.length
    }
  });
}

// Sleep data handler  
async function handleSleepData(userId: string, res: NextApiResponse<DataResponse>, provider?: string, terraUserId?: string, startDate?: string, endDate?: string, format?: string) {
  const connections = await WearablesDatabase.getUserConnections(userId);
  
  const targetConnections = provider 
    ? connections.filter(c => c.provider === provider)
    : terraUserId 
    ? connections.filter(c => c.terra_user_id === terraUserId)
    : connections;

  const allSleepData: any[] = [];

  for (const connection of targetConnections) {
    try {
      const sleepData = await terraClient.getSleepData(connection.terra_user_id, startDate!, endDate!);
      allSleepData.push(...sleepData.map((d: any) => ({ ...d, provider: connection.provider })));
    } catch (error) {
      console.warn(`Sleep data failed for ${connection.provider}:`, error);
    }
  }

  const responseData = format === 'summary' ? {
    total_sleep_sessions: allSleepData.length,
    average_duration: allSleepData.length > 0 ? allSleepData.reduce((sum, d) => sum + (d.duration_hours || 0), 0) / allSleepData.length : 0,
    average_score: allSleepData.length > 0 ? allSleepData.reduce((sum, d) => sum + (d.score || 0), 0) / allSleepData.length : 0,
    providers: [...new Set(allSleepData.map(d => d.provider))]
  } : {
    sleep_sessions: allSleepData,
    count: allSleepData.length
  };

  return res.status(200).json({
    success: true,
    data: responseData,
    metadata: {
      data_type: 'sleep',
      date_range: { start: startDate!, end: endDate! },
      records_count: allSleepData.length
    }
  });
}

// Heart rate data handler
async function handleHeartRateData(userId: string, res: NextApiResponse<DataResponse>, provider?: string, terraUserId?: string, startDate?: string, endDate?: string, format?: string) {
  const connections = await WearablesDatabase.getUserConnections(userId);
  
  const targetConnections = provider 
    ? connections.filter(c => c.provider === provider)
    : terraUserId 
    ? connections.filter(c => c.terra_user_id === terraUserId)
    : connections;

  const allHeartRateData: any[] = [];

  for (const connection of targetConnections) {
    try {
      const heartRateData = await terraClient.getHeartRateData(connection.terra_user_id, startDate!, endDate!);
      allHeartRateData.push(...heartRateData.map((d: any) => ({ ...d, provider: connection.provider })));
    } catch (error) {
      console.warn(`Heart rate data failed for ${connection.provider}:`, error);
    }
  }

  const responseData = format === 'summary' ? {
    total_readings: allHeartRateData.length,
    average_hr: allHeartRateData.length > 0 ? allHeartRateData.reduce((sum, d) => sum + (d.heart_rate || 0), 0) / allHeartRateData.length : 0,
    max_hr: allHeartRateData.length > 0 ? Math.max(...allHeartRateData.map(d => d.heart_rate || 0)) : 0,
    min_hr: allHeartRateData.length > 0 ? Math.min(...allHeartRateData.map(d => d.heart_rate || 0)) : 0
  } : {
    heart_rate_data: allHeartRateData,
    count: allHeartRateData.length
  };

  return res.status(200).json({
    success: true,
    data: responseData,
    metadata: {
      data_type: 'heart_rate',
      date_range: { start: startDate!, end: endDate! },
      records_count: allHeartRateData.length
    }
  });
}

// Body data handler
async function handleBodyData(userId: string, res: NextApiResponse<DataResponse>, provider?: string, terraUserId?: string, startDate?: string, endDate?: string, format?: string) {
  const connections = await WearablesDatabase.getUserConnections(userId);
  
  const targetConnections = provider 
    ? connections.filter(c => c.provider === provider)
    : terraUserId 
    ? connections.filter(c => c.terra_user_id === terraUserId)
    : connections;

  const allBodyData: any[] = [];

  for (const connection of targetConnections) {
    try {
      const bodyData = await terraClient.getBodyData(connection.terra_user_id, startDate!, endDate!);
      allBodyData.push(...bodyData.map((d: any) => ({ ...d, provider: connection.provider })));
    } catch (error) {
      console.warn(`Body data failed for ${connection.provider}:`, error);
    }
  }

  const responseData = format === 'summary' ? {
    total_measurements: allBodyData.length,
    latest_weight: allBodyData.length > 0 ? allBodyData[allBodyData.length - 1].weight : null,
    weight_trend: calculateWeightTrend(allBodyData),
    providers: [...new Set(allBodyData.map(d => d.provider))]
  } : {
    body_measurements: allBodyData,
    count: allBodyData.length
  };

  return res.status(200).json({
    success: true,
    data: responseData,
    metadata: {
      data_type: 'body',
      date_range: { start: startDate!, end: endDate! },
      records_count: allBodyData.length
    }
  });
}

// All data handler (original functionality)
async function handleAllData(userId: string, res: NextApiResponse<DataResponse>, provider?: string, startDate?: string, endDate?: string, format?: string, includeRaw?: boolean) {
  const connections = await WearablesDatabase.getUserConnections(userId);

  if (connections.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        connections: [],
        recent_data: {},
        summary: null
      }
    });
  }

  console.log(`📱 Found ${connections.length} wearable connections for user`);

  // Get recent health data from database
  const recentData = await WearablesDatabase.getRecentHealthData(userId, 7);
  const allData: any = { connections: [], recent_data: recentData };

  for (const connection of connections) {
    if (provider && connection.provider !== provider) continue;

    try {
      console.log(`🔄 Syncing data for ${connection.provider} (${connection.terra_user_id})`);

      const [activityResult, sleepResult, heartRateResult] = await Promise.allSettled([
        terraClient.getActivityData(connection.terra_user_id, startDate!, endDate!),
        terraClient.getSleepData(connection.terra_user_id, startDate!, endDate!),
        terraClient.getHeartRateData(connection.terra_user_id, startDate!, endDate!)
      ]);

      const connectionData = {
        provider: connection.provider,
        terra_user_id: connection.terra_user_id,
        status: (connection as any).status || 'unknown',
        activity_data: activityResult.status === 'fulfilled' ? activityResult.value : [],
        sleep_data: sleepResult.status === 'fulfilled' ? sleepResult.value : [],
        heart_rate_data: heartRateResult.status === 'fulfilled' ? heartRateResult.value : []
      };

      allData.connections.push(connectionData);

    } catch (error) {
      console.error(`Failed to sync ${connection.provider}:`, error);
      allData.connections.push({
        provider: connection.provider,
        terra_user_id: connection.terra_user_id,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return res.status(200).json({
    success: true,
    data: allData,
    metadata: {
      data_type: 'all',
      date_range: { start: startDate!, end: endDate! },
      // connections_count: allData.connections.length, // Removed to match interface
      last_updated: new Date().toISOString()
    }
  });
}

// Helper functions
function calculateWeightTrend(bodyData: any[]): string {
  if (bodyData.length < 2) return 'insufficient_data';
  
  const sortedData = bodyData.filter(d => d.weight).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sortedData.length < 2) return 'insufficient_data';
  
  const latest = sortedData[sortedData.length - 1].weight;
  const previous = sortedData[sortedData.length - 2].weight;
  
  const diff = latest - previous;
  if (Math.abs(diff) < 0.5) return 'stable';
  return diff > 0 ? 'increasing' : 'decreasing';
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}