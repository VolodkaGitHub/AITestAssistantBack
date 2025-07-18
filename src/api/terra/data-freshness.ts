import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

interface UserDataFreshness {
  user_id: string;
  provider: string;
  connection_id: string;
  last_sync: string | null;
  latest_data: string | null;
  data_age_hours: number | null;
  status: 'fresh' | 'stale' | 'critical' | 'no_data';
  alert_needed: boolean;
  recommended_action: string;
}

interface FreshnessReport {
  total_users: number;
  fresh_connections: number;
  stale_connections: number;
  critical_connections: number;
  no_data_connections: number;
  alerts_created: number;
  alerts_cleared: number;
}

/**
 * @deprecated This endpoint is deprecated. Use /api/terra/data?data_type=freshness instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Data Freshness Monitoring
 * Monitors data freshness across all users and creates alerts for stale data
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pool = DatabasePool.getInstance();

  try {
    console.log('🔍 Starting data freshness monitoring at:', new Date().toISOString());

    // Get all active wearable connections with their data freshness status
    const freshnessQuery = `
      WITH latest_data AS (
        SELECT 
          hd.user_id,
          hd.provider,
          MAX(hd.recorded_at) as latest_data_time,
          COUNT(*) as total_records
        FROM health_data hd
        WHERE hd.recorded_at > NOW() - INTERVAL '7 days'
        GROUP BY hd.user_id, hd.provider
      )
      SELECT 
        wc.user_id,
        wc.provider,
        wc.id as connection_id,
        wc.last_sync,
        wc.connected_at,
        ld.latest_data_time,
        ld.total_records,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(ld.latest_data_time, wc.connected_at)))/3600 as data_age_hours,
        EXTRACT(EPOCH FROM (NOW() - wc.last_sync))/3600 as sync_age_hours
      FROM wearable_connections wc
      LEFT JOIN latest_data ld ON wc.user_id = ld.user_id AND wc.provider = ld.provider
      WHERE wc.is_active = true
      ORDER BY data_age_hours DESC NULLS FIRST
    `;

    const result = await pool.query(freshnessQuery);
    const connections = result.rows;

    console.log(`📊 Analyzing ${connections.length} active connections for data freshness`);

    const userDataFreshness: UserDataFreshness[] = [];
    let alertsCreated = 0;
    let alertsCleared = 0;

    for (const conn of connections) {
      const dataAgeHours = conn.data_age_hours;
      const syncAgeHours = conn.sync_age_hours;

      // Determine freshness status based on data age - be more lenient for Oura
      let status: 'fresh' | 'stale' | 'critical' | 'no_data' = 'no_data';
      let alertNeeded = false;
      let recommendedAction = '';

      if (!conn.latest_data_time) {
        // Check if connection is very recent (within 24 hours)
        const connectionAgeHours = (Date.now() - new Date(conn.connected_at).getTime()) / (1000 * 60 * 60);
        if (connectionAgeHours <= 24) {
          status = 'fresh'; // Give new connections time to sync
          alertNeeded = false;
        } else {
          status = 'no_data';
          alertNeeded = true;
          recommendedAction = 'No data received yet. Please ensure your device is syncing properly.';
        }
      } else if (dataAgeHours <= 36) { // More lenient for Oura (36 hours instead of 24)
        status = 'fresh';
        alertNeeded = false;
      } else if (dataAgeHours <= 72) { // Extended stale period (72 hours instead of 48)
        status = 'stale';
        alertNeeded = true;
        recommendedAction = 'Data is getting stale. Please check your device sync settings.';
      } else {
        status = 'critical';
        alertNeeded = true;
        recommendedAction = 'Critical: No data received for over 72 hours. Please reconnect your device.';
      }

      const freshness: UserDataFreshness = {
        user_id: conn.user_id,
        provider: conn.provider,
        connection_id: conn.connection_id,
        last_sync: conn.last_sync,
        latest_data: conn.latest_data_time,
        data_age_hours: dataAgeHours,
        status,
        alert_needed: alertNeeded,
        recommended_action: recommendedAction
      };

      userDataFreshness.push(freshness);

      // Create or clear alerts based on status
      if (alertNeeded && status !== 'fresh') {
        const alertCreated = await createDataFreshnessAlert(
          conn.user_id, 
          conn.provider, 
          status, 
          dataAgeHours,
          recommendedAction
        );
        if (alertCreated) alertsCreated++;
      } else if (status === 'fresh') {
        const alertCleared = await clearDataFreshnessAlert(conn.user_id, conn.provider);
        if (alertCleared) alertsCleared++;
      }
    }

    // Generate freshness report
    const report: FreshnessReport = {
      total_users: new Set(userDataFreshness.map(u => u.user_id)).size,
      fresh_connections: userDataFreshness.filter(u => u.status === 'fresh').length,
      stale_connections: userDataFreshness.filter(u => u.status === 'stale').length,
      critical_connections: userDataFreshness.filter(u => u.status === 'critical').length,
      no_data_connections: userDataFreshness.filter(u => u.status === 'no_data').length,
      alerts_created: alertsCreated,
      alerts_cleared: alertsCleared
    };

    console.log('📋 Data freshness report:', report);

    // Store freshness metrics for historical tracking
    await storeFreshnessMetrics(report, userDataFreshness);

    // If this is a GET request, return detailed analysis
    if (req.method === 'GET') {
      // Get user-specific data if userId is provided
      const { userId } = req.query;

      if (userId) {
        const userFreshness = userDataFreshness.filter(u => u.user_id === userId);
        const userAlerts = await getUserAlerts(userId as string);

        return res.status(200).json({
          success: true,
          user_id: userId,
          connections: userFreshness,
          alerts: userAlerts,
          summary: {
            total_connections: userFreshness.length,
            fresh_connections: userFreshness.filter(u => u.status === 'fresh').length,
            stale_connections: userFreshness.filter(u => u.status === 'stale').length,
            critical_connections: userFreshness.filter(u => u.status === 'critical').length,
            active_alerts: userAlerts.length
          }
        });
      }

      // Return full report
      return res.status(200).json({
        success: true,
        report,
        connections: userDataFreshness,
        monitoring_timestamp: new Date().toISOString()
      });
    }

    // POST request - monitoring run completed
    return res.status(200).json({
      success: true,
      message: 'Data freshness monitoring completed',
      report,
      monitoring_timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Data freshness monitoring error:', error);
    return res.status(500).json({
      error: 'Data freshness monitoring failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Create data freshness alert for user
 */
async function createDataFreshnessAlert(
  userId: string, 
  provider: string, 
  status: string, 
  dataAgeHours: number | null,
  recommendedAction: string
): Promise<boolean> {
  const pool = DatabasePool.getInstance();

  try {
    let title: string;
    let message: string;
    let priority: 'low' | 'medium' | 'high';

    switch (status) {
      case 'stale':
        title = `${provider} Data Sync Delay`;
        message = `Your ${provider} device hasn't synced new data in ${Math.round(dataAgeHours || 0)} hours. ${recommendedAction}`;
        priority = 'medium';
        break;
      case 'critical':
        title = `${provider} Connection Issue`;
        message = `Your ${provider} device hasn't synced data in over ${Math.round(dataAgeHours || 0)} hours. ${recommendedAction}`;
        priority = 'high';
        break;
      case 'no_data':
        title = `${provider} Setup Required`;
        message = `No data received from your ${provider} device yet. ${recommendedAction}`;
        priority = 'medium';
        break;
      default:
        return false;
    }

    const insertQuery = `
      INSERT INTO user_alerts (
        user_id, alert_type, title, message, priority, 
        metadata, created_at, updated_at
      )
      VALUES ($1, 'data_freshness', $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (user_id, alert_type, title) 
      DO UPDATE SET 
        message = $3, 
        priority = $4, 
        metadata = $5, 
        updated_at = NOW()
    `;

    const metadata = {
      provider,
      status,
      data_age_hours: dataAgeHours,
      recommended_action: recommendedAction
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Use advisory lock to prevent concurrent updates
      await client.query('SELECT pg_advisory_xact_lock($1)', [
        Buffer.from(`${userId}-${provider}`).readUInt32BE(0)
      ]);

      await client.query(insertQuery, [
        userId,
        title,
        message,
        priority,
        JSON.stringify(metadata)
      ]);

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating data freshness alert:', error);
      return false;
    } finally {
      client.release();
    }


  } catch (error) {
    console.error('Error creating data freshness alert:', error);
    return false;
  }
}

/**
 * Clear data freshness alert for user
 */
async function clearDataFreshnessAlert(userId: string, provider: string): Promise<boolean> {
  const pool = DatabasePool.getInstance();

  try {
    const deleteQuery = `
      DELETE FROM user_alerts 
      WHERE user_id = $1 
        AND alert_type = 'data_freshness' 
        AND title LIKE $2
    `;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Use advisory lock to prevent concurrent updates
      await client.query('SELECT pg_advisory_xact_lock($1)', [
        Buffer.from(`${userId}-${provider}`).readUInt32BE(0)
      ]);

      const result = await client.query(deleteQuery, [userId, `${provider}%`]);


      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error clearing data freshness alert:', error);
      return false;
    } finally {
      client.release();
    }



  } catch (error) {
    console.error('Error clearing data freshness alert:', error);
    return false;
  }
}

/**
 * Get user alerts
 */
async function getUserAlerts(userId: string) {
  const pool = DatabasePool.getInstance();

  const query = `
    SELECT alert_type, title, message, priority, metadata, created_at, updated_at
    FROM user_alerts 
    WHERE user_id = $1 
    ORDER BY priority DESC, updated_at DESC
  `;

  const result = await pool.query(query, [userId]);
  return result.rows;
}

/**
 * Store freshness metrics for historical tracking
 */
async function storeFreshnessMetrics(report: FreshnessReport, freshness: UserDataFreshness[]) {
  const pool = DatabasePool.getInstance();

  try {
    const insertQuery = `
      INSERT INTO data_freshness_metrics (
        monitoring_date, total_users, fresh_connections, stale_connections,
        critical_connections, no_data_connections, alerts_created, alerts_cleared,
        freshness_data, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `;

    await pool.query(insertQuery, [
      new Date().toISOString().split('T')[0],
      report.total_users,
      report.fresh_connections,
      report.stale_connections,
      report.critical_connections,
      report.no_data_connections,
      report.alerts_created,
      report.alerts_cleared,
      JSON.stringify(freshness)
    ]);

    console.log('📊 Stored freshness metrics for historical tracking');

  } catch (error) {
    console.error('Error storing freshness metrics:', error);
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}