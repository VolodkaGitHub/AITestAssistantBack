import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

interface UserSyncResult {
  provider: string;
  success: boolean;
  data_points: number;
  error?: string;
  sync_duration_ms: number;
}

/**
 * @deprecated This endpoint is deprecated. Use /api/terra/sync with sync_type: 'manual' instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * User-Triggered Manual Sync
 * Allows users to manually request immediate sync for their connected devices
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { provider } = req.body;
  
  // Extract user ID from session token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const sessionToken = authHeader.replace('Bearer ', '');
  
  // Get user ID from session token
  const client = await DatabasePool.getClient();
  
  let userId: string;
  try {
    const userQuery = `
      SELECT user_id FROM user_sessions 
      WHERE session_token = $1 AND expires_at > NOW()
    `;
    const userResult = await client.query(userQuery, [sessionToken]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    
    userId = userResult.rows[0].user_id;
  } catch (error) {
    return res.status(401).json({ error: 'Session validation failed' });
  } finally {
    client.release()
  }

  const startTime = Date.now();

  try {
    console.log(`🔄 Manual sync requested by user ${userId}${provider ? ` for ${provider}` : ' for all providers'}`);

    // Get user's active connections
    let connectionsQuery = `
      SELECT id, provider, terra_user_id, last_sync, scopes
      FROM wearable_connections 
      WHERE user_id = $1 AND is_active = true
    `;
    const queryParams = [userId];

    // Filter by specific provider if requested
    if (provider) {
      connectionsQuery += ' AND provider = $2';
      queryParams.push(provider.toUpperCase());
    }

    connectionsQuery += ' ORDER BY last_sync ASC NULLS FIRST';

    const connectionsResult = await client.query(connectionsQuery, queryParams);
    const connections = connectionsResult.rows;

    if (connections.length === 0) {
      return res.status(404).json({
        error: 'No active wearable connections found',
        message: provider 
          ? `No active ${provider} connection found for user`
          : 'No active wearable connections found for user'
      });
    }

    console.log(`📱 Found ${connections.length} connection(s) to sync for user ${userId}`);

    // Check rate limiting - prevent too frequent manual syncs
    const rateLimitResult = await checkSyncRateLimit(userId, provider);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: 'Sync rate limit exceeded',
        message: `Please wait ${rateLimitResult.waitTimeMinutes} minutes before requesting another sync`,
        retry_after: rateLimitResult.waitTimeMinutes * 60
      });
    }

    const syncResults: UserSyncResult[] = [];

    // Sync each connection
    for (const connection of connections) {
      const connectionStartTime = Date.now();
      
      try {
        console.log(`🌍 Syncing ${connection.provider} data for user ${userId}...`);
        
        const dataPoints = await fetchAndStoreRecentData(
          connection.terra_user_id, 
          connection.provider, 
          userId
        );

        // Update last_sync timestamp
        await client.query(
          'UPDATE wearable_connections SET last_sync = NOW() WHERE id = $1',
          [connection.id]
        );

        syncResults.push({
          provider: connection.provider,
          success: true,
          data_points: dataPoints,
          sync_duration_ms: Date.now() - connectionStartTime
        });

        console.log(`✅ Successfully synced ${connection.provider}: ${dataPoints} data points`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed to sync ${connection.provider}:`, errorMessage);

        syncResults.push({
          provider: connection.provider,
          success: false,
          data_points: 0,
          error: errorMessage,
          sync_duration_ms: Date.now() - connectionStartTime
        });
      }
    }

    // Record sync attempt for rate limiting
    await recordSyncAttempt(userId, provider);

    // Calculate summary
    const summary = {
      total_providers: syncResults.length,
      successful_syncs: syncResults.filter(r => r.success).length,
      failed_syncs: syncResults.filter(r => !r.success).length,
      total_data_points: syncResults.reduce((sum, r) => sum + r.data_points, 0),
      total_duration_ms: Date.now() - startTime
    };

    console.log(`📊 Manual sync completed for user ${userId}:`, summary);

    // Check if we should clear any stale data alerts
    if (summary.successful_syncs > 0) {
      await clearStaleDataAlerts(userId, syncResults.filter(r => r.success).map(r => r.provider));
    }

    return res.status(200).json({
      success: true,
      message: `Sync completed for ${summary.successful_syncs}/${summary.total_providers} providers`,
      summary,
      results: syncResults,
      next_sync_allowed_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes from now
    });

  } catch (error) {
    console.error('❌ Manual sync error:', error);
    return res.status(500).json({
      error: 'Manual sync failed',
      details: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime
    });
  }
}

/**
 * Check if user is within sync rate limits
 */
async function checkSyncRateLimit(userId: string, provider?: string): Promise<{
  allowed: boolean;
  waitTimeMinutes: number;
}> {
  const client = await DatabasePool.getClient();

  try {
    // Check last manual sync time (limit: once per 10 minutes per user)
    const query = `
      SELECT MAX(created_at) as last_sync
      FROM sync_attempts 
      WHERE user_id = $1 AND sync_type = 'manual'
      ${provider ? 'AND provider = $2' : ''}
    `;
    
    const params = [userId];
    if (provider) params.push(provider.toUpperCase());

    const result = await client.query(query, params);
  
  if (!result.rows[0]?.last_sync) {
    return { allowed: true, waitTimeMinutes: 0 };
  }

  const lastSync = new Date(result.rows[0].last_sync);
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  if (lastSync > tenMinutesAgo) {
    const waitTime = Math.ceil((lastSync.getTime() + 10 * 60 * 1000 - Date.now()) / (60 * 1000));
    return { allowed: false, waitTimeMinutes: waitTime };
  }

    return { allowed: true, waitTimeMinutes: 0 };
  } finally {
    client.release()
  }
}

/**
 * Record sync attempt for rate limiting
 */
async function recordSyncAttempt(userId: string, provider?: string) {
  const client = await DatabasePool.getClient();

  try {
    await client.query(`
      INSERT INTO sync_attempts (user_id, provider, sync_type, created_at)
      VALUES ($1, $2, 'manual', NOW())
    `, [userId, provider?.toUpperCase() || 'ALL']);
  } finally {
    client.release()
  }
}

/**
 * Fetch and store recent data (last 3 days)
 */
async function fetchAndStoreRecentData(terraUserId: string, provider: string, userId: string): Promise<number> {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30); // Extended to 30 days for better data coverage
  
  const startDate = thirtyDaysAgo.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];
  
  let totalDataPoints = 0;
  
  // Use only working Terra API endpoints
  const dataTypes = ['sleep', 'daily'];
  
  console.log(`📅 Fetching Terra data for ${provider} from ${startDate} to ${endDate}`);
  
  for (const dataType of dataTypes) {
    try {
      const data = await fetchTerraData(dataType, terraUserId, startDate, endDate);
      
      if (data?.data?.length > 0) {
        for (const record of data.data) {
          await storeHealthData(userId, dataType, record, provider);
          totalDataPoints++;
        }
        console.log(`📊 Stored ${data.data.length} ${dataType} records for ${provider}`);
      } else {
        console.log(`⚠️ No ${dataType} data available for ${provider} in the last 30 days`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to fetch ${dataType} data:`, error instanceof Error ? error.message : String(error));
    }
  }
  
  return totalDataPoints;
}

/**
 * Fetch data from Terra API using corrected v2 format
 */
async function fetchTerraData(dataType: string, userId: string, startDate: string, endDate: string) {
  // Use corrected Terra API v2 format - only use working endpoints
  const workingEndpoints = ['sleep', 'daily'];
  
  if (!workingEndpoints.includes(dataType)) {
    console.log(`⚠️ Skipping ${dataType} - endpoint not working with current Terra API`);
    return { data: [] };
  }
  
  const url = `https://api.tryterra.co/v2/${dataType}?user_id=${userId}&start_date=${startDate}&end_date=${endDate}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'dev-id': process.env.TERRA_DEV_ID_PROD || process.env.TERRA_DEV_ID!,
      'x-api-key': process.env.TERRA_API_KEY_PROD || process.env.TERRA_API_KEY!,
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Terra API ${dataType} failed: ${response.status} - ${errorText.substring(0, 200)}`);
    throw new Error(`Terra API ${dataType} failed: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Store health data in wearable_health_data table (where UI reads from)
 */
async function storeHealthData(userId: string, dataType: string, data: any, provider: string) {
  const client = await DatabasePool.getClient();

  try {
  
  // Extract meaningful health metrics from Terra data
  const recordedAt = new Date(data.metadata?.start_time || data.metadata?.upload_timestamp || new Date());
  
  let healthMetrics: any = {
    data_type: dataType,
    recorded_at: recordedAt,
    data_points: 1
  };

  // Process Terra data into standardized health metrics
  if (dataType === 'daily' && data.summary) {
    healthMetrics = {
      ...healthMetrics,
      steps: data.summary.steps || 0,
      calories: data.summary.calories_total || 0,
      distance: data.summary.distance_total || 0,
      active_minutes: data.summary.active_durations_summary?.active_seconds || 0,
      sleep_score: data.summary.sleep_score || null,
      training_stress: data.summary.stress_level || null,
      respiratory_health: data.summary.respiratory_rate || null,
      immunity_index: data.summary.immunity_index || null
    };
  } else if (dataType === 'sleep' && data.sleep_durations) {
    healthMetrics = {
      ...healthMetrics,
      sleep_duration: data.sleep_durations.total_sleep_duration || 0,
      sleep_score: data.sleep_efficiency || null,
      deep_sleep: data.sleep_durations.deep_sleep_duration || 0,
      light_sleep: data.sleep_durations.light_sleep_duration || 0,
      rem_sleep: data.sleep_durations.rem_sleep_duration || 0
    };
  }

  // Store in wearable_health_data table where UI reads from
  const insertQuery = `
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
  `;
  
    await client.query(insertQuery, [
      userId, provider, healthMetrics.data_type, healthMetrics.recorded_at, healthMetrics.data_points,
      healthMetrics.steps || null, healthMetrics.calories || null, healthMetrics.distance || null,
      healthMetrics.active_minutes || null, healthMetrics.sleep_duration || null,
      healthMetrics.sleep_score || null, healthMetrics.training_stress || null,
      healthMetrics.respiratory_health || null, healthMetrics.immunity_index || null,
      healthMetrics.deep_sleep || null, healthMetrics.light_sleep || null, healthMetrics.rem_sleep || null
    ]);
  } finally {
    client.release()
  }
}

/**
 * Clear stale data alerts for successfully synced providers
 */
async function clearStaleDataAlerts(userId: string, providers: string[]) {
  const client = await DatabasePool.getClient();

  try {
    for (const provider of providers) {
      await client.query(`
        DELETE FROM user_alerts 
        WHERE user_id = $1 AND alert_type = 'stale_data' AND title LIKE $2
      `, [userId, `${provider}%`]);
    }

    console.log(`🧹 Cleared stale data alerts for ${providers.join(', ')}`);
  } finally {
    client.release()
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}