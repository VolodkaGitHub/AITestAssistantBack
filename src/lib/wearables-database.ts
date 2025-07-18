/**
 * Wearables Database Module
 * Manages wearable device connections and health data storage
 */

import { DatabasePool } from './database-pool'

export interface WearableConnection {
  id: string
  user_id: string
  provider: string
  terra_user_id: string
  status: 'connected' | 'disconnected' | 'error'
  scopes: string[]
  connected_at: Date
  last_sync: Date | null
  metadata?: any
  is_active: boolean
}

export interface HealthMetrics {
  user_id: string
  provider: string
  data_type: 'sleep' | 'activity' | 'heart_rate' | 'body' | 'nutrition'
  data: any
  recorded_at: Date
  synced_at: Date
}

export interface HealthDataSummary {
  summary: {
    total_steps: number
    total_calories: number
    avg_heart_rate: number
    sleep_hours: number
    last_sync: string | null
  }
  recent_activity: HealthMetrics[]
  devices: WearableConnection[]
}

export class WearablesDatabase {

  /**
   * Save daily health summary
   */
  static async saveDailyHealthSummary(
    userId: string,
    date: string,
    provider: string,
    summaryData: any,
    rawData?: any
  ): Promise<void> {
    const client = await DatabasePool.getClient()

    try {
      await client.query(`
        INSERT INTO daily_health_scores (user_id, summary_date, provider, summary_data, raw_data)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, summary_date, provider) DO UPDATE SET
          summary_data = EXCLUDED.summary_data,
          raw_data = EXCLUDED.raw_data,
          updated_at = CURRENT_TIMESTAMP
      `, [userId, date, provider, summaryData, rawData || {}])
    } finally {
      client.release()
    }
  }



  /**
   * Initialize wearables database schema
   */
  static async initializeSchema(): Promise<void> {
    const client = await DatabasePool.getClient()

    try {
      // Create wearable_connections table
      await client.query(`
        CREATE TABLE IF NOT EXISTS wearable_connections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          provider VARCHAR(50) NOT NULL,
          terra_user_id VARCHAR(255) UNIQUE NOT NULL,
          status VARCHAR(20) DEFAULT 'connected',
          scopes TEXT[] DEFAULT '{}',
          connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_sync TIMESTAMP WITH TIME ZONE,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, provider)
        )
      `)

      // Create health_data table
      await client.query(`
        CREATE TABLE IF NOT EXISTS health_data (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          provider VARCHAR(50) NOT NULL,
          data_type VARCHAR(50) NOT NULL,
          data JSONB NOT NULL,
          recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
          synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_health_data_user FOREIGN KEY (user_id) 
            REFERENCES users(id) ON DELETE CASCADE
        )
      `)

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_wearable_connections_user_id 
        ON wearable_connections(user_id)
      `)
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_wearable_connections_terra_user_id 
        ON wearable_connections(terra_user_id)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_health_data_user_id 
        ON health_data(user_id)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_health_data_recorded_at 
        ON health_data(recorded_at DESC)
      `)

      console.log('✅ Wearables database schema initialized successfully')
    } finally {
      client.release()
    }
  }

  /**
   * Create a new wearable connection
   */
  static async createConnection(data: {
    user_id: string
    provider: string
    terra_user_id: string
    scopes: string[]
    metadata?: any
  }): Promise<WearableConnection> {
    const client = await DatabasePool.getClient()

    try {
      const result = await client.query(`
        INSERT INTO wearable_connections (user_id, provider, terra_user_id, scopes, metadata)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, provider) DO UPDATE SET
          terra_user_id = EXCLUDED.terra_user_id,
          scopes = EXCLUDED.scopes,
          metadata = EXCLUDED.metadata,
          status = 'connected',
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [data.user_id, data.provider, data.terra_user_id, data.scopes, data.metadata || {}])

      return result.rows[0]
    } finally {
      client.release()
    }
  }

  /**
   * Get connection by Terra user ID
   */
  static async getConnectionByTerraUserId(terraUserId: string): Promise<WearableConnection | null> {
    const client = await DatabasePool.getClient()

    try {
      const result = await client.query(`
        SELECT * FROM wearable_connections 
        WHERE terra_user_id = $1
      `, [terraUserId])

      return result.rows[0] || null
    } finally {
      client.release()
    }
  }

  /**
   * Get user's wearable connections
   */
  static async getUserConnections(userId: string): Promise<WearableConnection[]> {
    const client = await DatabasePool.getClient()

    try {
      const result = await client.query(`
        SELECT * FROM wearable_connections 
        WHERE user_id = $1 
        ORDER BY connected_at DESC
      `, [userId])

      return result.rows
    } finally {
      client.release()
    }
  }

  /**
   * Save health data
   */
  static async saveHealthData(
    userId: string,
    provider: string,
    dataType: string,
    data: any,
    recordedAt: Date
  ): Promise<void> {
    const client = await DatabasePool.getClient()

    try {
      await client.query(`
        INSERT INTO health_data (user_id, provider, data_type, data, recorded_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, provider, dataType, data, recordedAt])
    } finally {
      client.release()
    }
  }

  /**
   * Update last sync time
   */
  static async updateLastSync(userId: string, provider: string): Promise<void> {
    const client = await DatabasePool.getClient()

    try {
      await client.query(`
        UPDATE wearable_connections 
        SET last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND provider = $2
      `, [userId, provider])
    } finally {
      client.release()
    }
  }

  /**
   * Get latest health metrics for a user
   */
  static async getLatestHealthMetrics(userId: string): Promise<HealthDataSummary | null> {
    const client = await DatabasePool.getClient()

    try {
      // Get connections
      const connectionsResult = await client.query(`
        SELECT * FROM wearable_connections 
        WHERE user_id = $1 
        ORDER BY connected_at DESC
      `, [userId])

      const devices = connectionsResult.rows

      // Get recent health data
      const healthDataResult = await client.query(`
        SELECT * FROM health_data 
        WHERE user_id = $1 
        ORDER BY recorded_at DESC 
        LIMIT 50
      `, [userId])

      const recentActivity = healthDataResult.rows

      // Calculate summary metrics
      const summary = {
        total_steps: 0,
        total_calories: 0,
        avg_heart_rate: 0,
        sleep_hours: 0,
        last_sync: devices.length > 0 ? devices[0].last_sync : null
      }

      // Aggregate metrics from recent data
      let stepCount = 0
      let calorieCount = 0
      let heartRateSum = 0
      let heartRateCount = 0
      let sleepCount = 0

      for (const record of recentActivity) {
        if (record.data_type === 'activity' && record.data.steps_data) {
          summary.total_steps += record.data.steps_data.summary?.count || 0
          stepCount++
        }
        if (record.data_type === 'activity' && record.data.calories_data) {
          summary.total_calories += record.data.calories_data.total_burned_calories || 0
          calorieCount++
        }
        if (record.data_type === 'heart_rate' && record.data.avg_hr_bpm) {
          heartRateSum += record.data.avg_hr_bpm
          heartRateCount++
        }
        if (record.data_type === 'sleep' && record.data.sleep_durations_data) {
          summary.sleep_hours += (record.data.sleep_durations_data.asleep.duration_asleep_state_seconds || 0) / 3600
          sleepCount++
        }
      }

      if (heartRateCount > 0) {
        summary.avg_heart_rate = Math.round(heartRateSum / heartRateCount)
      }

      return {
        summary,
        recent_activity: recentActivity,
        devices
      }
    } finally {
      client.release()
    }
  }

  /**
   * Update connection status
   */
  static async updateConnectionStatus(connectionId: string, isActive: boolean): Promise<void> {
    // Using DatabasePool.getClient() directly;
    const client = await DatabasePool.getClient();
    
    try {
      await client.query(
        'UPDATE wearable_connections SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [isActive, connectionId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get health data with optional filtering
   */
  static async getHealthData(userId: string, dataType?: string, since?: Date): Promise<any[]> {
    // Using DatabasePool.getClient() directly;
    const client = await DatabasePool.getClient();
    
    try {
      let query = 'SELECT * FROM health_data WHERE user_id = $1';
      const params: any[] = [userId];
      
      if (dataType) {
        query += ' AND data_type = $2';
        params.push(dataType);
      }
      
      if (since) {
        query += ` AND recorded_at >= $${params.length + 1}`;
        params.push(since);
      }
      
      query += ' ORDER BY recorded_at DESC';
      
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get health summary for user
   */
  static async getHealthSummary(userId: string): Promise<string | null> {
    const recentData = await this.getHealthData(userId, undefined, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    
    if (recentData.length === 0) {
      return null;
    }
    
    return `Recent health data available from ${recentData.length} entries`;
  }

  /**
   * Disconnect a wearable device
   */
  static async disconnectDevice(userId: string, provider: string): Promise<void> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()

    try {
      await client.query(`
        UPDATE wearable_connections 
        SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND provider = $2
      `, [userId, provider])
    } finally {
      client.release()
    }
  }

  /**
   * Disconnect a wearable device (alias for disconnectDevice)
   */
  static async disconnectWearable(userId: string, provider: string): Promise<void> {
    return this.disconnectDevice(userId, provider)
  }

  /**
   * Get device data for a specific provider
   */
  static async getDeviceData(userId: string, provider: string): Promise<{
    connection: WearableConnection | null
    recentData: HealthMetrics[]
    summary: any
  }> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()

    try {
      // Get connection
      const connectionResult = await client.query(`
        SELECT * FROM wearable_connections 
        WHERE user_id = $1 AND provider = $2
      `, [userId, provider])

      const connection = connectionResult.rows[0] || null

      // Get recent data
      const dataResult = await client.query(`
        SELECT * FROM health_data 
        WHERE user_id = $1 AND provider = $2 
        ORDER BY recorded_at DESC 
        LIMIT 30
      `, [userId, provider])

      const recentData = dataResult.rows

      // Build summary
      const summary = {
        last_7_days: recentData.slice(0, 7),
        total_records: recentData.length,
        data_types: [...new Set(recentData.map(d => d.data_type))],
        date_range: {
          start: recentData.length > 0 ? recentData[recentData.length - 1].recorded_at : null,
          end: recentData.length > 0 ? recentData[0].recorded_at : null
        }
      }

      return {
        connection,
        recentData,
        summary
      }
    } finally {
      client.release()
    }
  }



  /**
   * Save wearable connection
   */
  static async saveConnection(connectionData: any): Promise<void> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()

    try {
      await client.query(`
        INSERT INTO wearable_connections (user_id, provider, terra_user_id, status, last_sync, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, provider) 
        DO UPDATE SET 
          terra_user_id = $3,
          status = $4,
          last_sync = $5,
          updated_at = CURRENT_TIMESTAMP
      `, [
        connectionData.user_id,
        connectionData.provider,
        connectionData.terra_user_id,
        connectionData.status || 'connected',
        connectionData.last_sync || new Date()
      ])
    } finally {
      client.release()
    }
  }

  /**
   * Get recent health data for user
   */
  static async getRecentHealthData(userId: string, days: number = 7): Promise<any> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()

    try {
      const result = await client.query(`
        SELECT * FROM health_data 
        WHERE user_id = $1 
        AND recorded_at >= NOW() - INTERVAL '${days} days'
        ORDER BY recorded_at DESC
      `, [userId])

      // Group by provider
      const groupedData: any = {}
      for (const row of result.rows) {
        if (!groupedData[row.provider]) {
          groupedData[row.provider] = []
        }
        groupedData[row.provider].push(row)
      }

      return groupedData
    } finally {
      client.release()
    }
  }

  /**
   * Get health data by type
   */
  static async getHealthDataByType(userId: string, dataType: string): Promise<any[]> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()

    try {
      const result = await client.query(`
        SELECT * FROM health_data 
        WHERE user_id = $1 AND data_type = $2
        ORDER BY recorded_at DESC
        LIMIT 50
      `, [userId, dataType])

      return result.rows
    } finally {
      client.release()
    }
  }

  /**
   * Generate health summary
   */
  static async generateHealthSummary(userId: string): Promise<string | null> {
    const recentData = await this.getRecentHealthData(userId, 7)
    
    if (!recentData || Object.keys(recentData).length === 0) {
      return null
    }

    const summaryParts = []
    let totalDataPoints = 0

    for (const [provider, data] of Object.entries(recentData as any)) {
      if (Array.isArray(data)) {
        totalDataPoints += data.length
        summaryParts.push(`${provider}: ${data.length} records`)
      }
    }

    if (totalDataPoints === 0) {
      return null
    }

    return `${totalDataPoints} health data points from ${Object.keys(recentData).length} devices: ${summaryParts.join(', ')}`
  }




}