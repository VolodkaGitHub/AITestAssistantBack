/**
 * Terra SQL Client Module
 * Provides SQL-based Terra API integration with database operations
 */

import { DatabasePool } from './database-pool';
import { WearablesDatabase } from './wearables-database'

export interface TerraUserRecord {
  id: string
  user_id: string
  terra_user_id: string
  provider: string
  status: string
  scopes: string[]
  created_at: Date
  last_sync: Date | null
}

export interface TerraDataRecord {
  id: string
  terra_user_id: string
  data_type: string
  data: any
  recorded_at: Date
  synced_at: Date
}

export interface TerraHealthSummary {
  user_id: string
  provider: string
  total_records: number
  data_types: string[]
  last_sync: string | null
  date_range: {
    earliest: string | null
    latest: string | null
  }
  summary_stats: {
    total_steps: number
    total_calories: number
    avg_heart_rate: number
    sleep_hours: number
  }
}

export class TerraSQLClient {
  private static instance: TerraSQLClient | null = null

  private constructor() {}

  static getInstance(): TerraSQLClient {
    if (!this.instance) {
      this.instance = new TerraSQLClient()
    }
    return this.instance
  }



  /**
   * Initialize Terra SQL schema
   */
  async initializeSchema(): Promise<void> {
    // Use WearablesDatabase to initialize schema
    await WearablesDatabase.initializeSchema()
    console.log('✅ Terra SQL schema initialized')
  }

  /**
   * Get Terra user by user ID
   */
  async getTerraUserByUserId(userId: string): Promise<TerraUserRecord[]> {
    const client = await DatabasePool.getClient()

    try {
      const result = await client.query(`
        SELECT 
          id,
          user_id,
          terra_user_id,
          provider,
          status,
          scopes,
          connected_at as created_at,
          last_sync
        FROM wearable_connections 
        WHERE user_id = $1
        ORDER BY connected_at DESC
      `, [userId])

      return result.rows.map(row => ({
        ...row,
        scopes: Array.isArray(row.scopes) ? row.scopes : []
      }))
    } finally {
      client.release()
    }
  }

  /**
   * Get Terra user by Terra user ID
   */
  async getTerraUserByTerraId(terraUserId: string): Promise<TerraUserRecord | null> {
    const client = await DatabasePool.getClient()

    try {
      const result = await client.query(`
        SELECT 
          id,
          user_id,
          terra_user_id,
          provider,
          status,
          scopes,
          connected_at as created_at,
          last_sync
        FROM wearable_connections 
        WHERE terra_user_id = $1
      `, [terraUserId])

      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      return {
        ...row,
        scopes: Array.isArray(row.scopes) ? row.scopes : []
      }
    } finally {
      client.release()
    }
  }

  /**
   * Create or update Terra user connection
   */
  async upsertTerraUser(data: {
    user_id: string
    terra_user_id: string
    provider: string
    scopes: string[]
    metadata?: any
  }): Promise<TerraUserRecord> {
    const connection = await WearablesDatabase.createConnection(data)
    
    return {
      id: connection.id,
      user_id: connection.user_id,
      terra_user_id: connection.terra_user_id,
      provider: connection.provider,
      status: connection.status,
      scopes: connection.scopes,
      created_at: connection.connected_at,
      last_sync: connection.last_sync
    }
  }

  /**
   * Store Terra health data
   */
  async storeTerraData(data: {
    user_id: string
    provider: string
    data_type: string
    terra_data: any
    recorded_at: Date
  }): Promise<void> {
    await WearablesDatabase.saveHealthData(
      data.user_id,
      data.provider,
      data.data_type,
      data.terra_data,
      data.recorded_at
    )
  }

  /**
   * Get Terra health data for user
   */
  async getTerraDataByUserId(
    userId: string, 
    dataType?: string,
    limit: number = 50
  ): Promise<TerraDataRecord[]> {
    const client = await DatabasePool.getClient()

    try {
      let query = `
        SELECT 
          id,
          user_id as terra_user_id,
          data_type,
          data,
          recorded_at,
          synced_at
        FROM health_data 
        WHERE user_id = $1
      `
      const params: any[] = [userId]

      if (dataType) {
        query += ` AND data_type = $2`
        params.push(dataType)
      }

      query += ` ORDER BY recorded_at DESC LIMIT $${params.length + 1}`
      params.push(limit)

      const result = await client.query(query, params)
      return result.rows
    } finally {
      client.release()
    }
  }

  /**
   * Get Terra health summary for user
   */
  async getTerraHealthSummary(userId: string): Promise<TerraHealthSummary | null> {
    const client = await DatabasePool.getClient()

    try {
      // Get connection info
      const connectionResult = await client.query(`
        SELECT provider, last_sync 
        FROM wearable_connections 
        WHERE user_id = $1 
        ORDER BY connected_at DESC 
        LIMIT 1
      `, [userId])

      if (connectionResult.rows.length === 0) {
        return null
      }

      const connection = connectionResult.rows[0]

      // Get data summary
      const dataResult = await client.query(`
        SELECT 
          COUNT(*) as total_records,
          MIN(recorded_at) as earliest_date,
          MAX(recorded_at) as latest_date,
          array_agg(DISTINCT data_type) as data_types
        FROM health_data 
        WHERE user_id = $1
      `, [userId])

      const dataSummary = dataResult.rows[0]

      // Calculate summary statistics
      const statsResult = await client.query(`
        SELECT 
          data_type,
          data
        FROM health_data 
        WHERE user_id = $1 
        ORDER BY recorded_at DESC 
        LIMIT 100
      `, [userId])

      let totalSteps = 0
      let totalCalories = 0
      let heartRateSum = 0
      let heartRateCount = 0
      let sleepHours = 0

      for (const record of statsResult.rows) {
        const data = record.data
        
        if (record.data_type === 'activity') {
          if (data.steps_data?.summary?.count) {
            totalSteps += data.steps_data.summary.count
          }
          if (data.calories_data?.total_burned_calories) {
            totalCalories += data.calories_data.total_burned_calories
          }
        }
        
        if (record.data_type === 'heart_rate' && data.avg_hr_bpm) {
          heartRateSum += data.avg_hr_bpm
          heartRateCount++
        }
        
        if (record.data_type === 'sleep' && data.sleep_durations_data) {
          const sleepSeconds = data.sleep_durations_data.asleep?.duration_asleep_state_seconds || 0
          sleepHours += sleepSeconds / 3600
        }
      }

      return {
        user_id: userId,
        provider: connection.provider,
        total_records: parseInt(dataSummary.total_records),
        data_types: dataSummary.data_types || [],
        last_sync: connection.last_sync,
        date_range: {
          earliest: dataSummary.earliest_date,
          latest: dataSummary.latest_date
        },
        summary_stats: {
          total_steps: totalSteps,
          total_calories: totalCalories,
          avg_heart_rate: heartRateCount > 0 ? Math.round(heartRateSum / heartRateCount) : 0,
          sleep_hours: Math.round(sleepHours * 10) / 10
        }
      }
    } finally {
      client.release()
    }
  }

  /**
   * Update last sync time for Terra user
   */
  async updateLastSync(terraUserId: string): Promise<void> {
    const client = await DatabasePool.getClient()

    try {
      await client.query(`
        UPDATE wearable_connections 
        SET last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE terra_user_id = $1
      `, [terraUserId])
    } finally {
      client.release()
    }
  }

  /**
   * Delete Terra user connection
   */
  async deleteTerraUser(terraUserId: string): Promise<void> {
    const client = await DatabasePool.getClient()

    try {
      await client.query(`
        UPDATE wearable_connections 
        SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP
        WHERE terra_user_id = $1
      `, [terraUserId])
    } finally {
      client.release()
    }
  }

  /**
   * Get Terra connection statistics
   */
  async getTerraStats(): Promise<{
    total_connections: number
    active_connections: number
    providers: Array<{ provider: string; count: number }>
    data_types: Array<{ data_type: string; count: number }>
  }> {
    const client = await DatabasePool.getClient()

    try {
      // Get connection stats
      const connectionStats = await client.query(`
        SELECT 
          COUNT(*) as total_connections,
          COUNT(CASE WHEN status = 'connected' THEN 1 END) as active_connections
        FROM wearable_connections
      `)

      // Get provider breakdown
      const providerStats = await client.query(`
        SELECT provider, COUNT(*) as count
        FROM wearable_connections
        WHERE status = 'connected'
        GROUP BY provider
        ORDER BY count DESC
      `)

      // Get data type breakdown
      const dataTypeStats = await client.query(`
        SELECT data_type, COUNT(*) as count
        FROM health_data
        GROUP BY data_type
        ORDER BY count DESC
      `)

      return {
        total_connections: parseInt(connectionStats.rows[0].total_connections),
        active_connections: parseInt(connectionStats.rows[0].active_connections),
        providers: providerStats.rows,
        data_types: dataTypeStats.rows
      }
    } finally {
      client.release()
    }
  }

  /**
   * Clean up old Terra data
   */
  async cleanupOldData(daysToKeep: number = 90): Promise<number> {
    const client = await DatabasePool.getClient()

    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

      const result = await client.query(`
        DELETE FROM health_data 
        WHERE recorded_at < $1
      `, [cutoffDate])

      console.log(`🧹 Cleaned up ${result.rowCount} old Terra data records`)
      return result.rowCount || 0
    } finally {
      client.release()
    }
  }
}

// Export singleton instance
export const terraSQLClient = TerraSQLClient.getInstance()
export default terraSQLClient