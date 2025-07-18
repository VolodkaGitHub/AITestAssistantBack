// Comprehensive Terra Database Setup for 90+ Wearable Devices
import { Pool } from 'pg'
import { DatabasePool } from '../lib/database-pool'

export interface TerraProvider {
  provider_code: string
  provider_name: string
  category: string
  supported_data_types: string[]
  is_active: boolean
  created_at: string
}

export interface TerraWebhookEvent {
  id: string
  user_id: string
  terra_user_id: string
  provider: string
  event_type: string
  data_type: string
  webhook_data: any
  processed: boolean
  received_at: string
  processed_at: string | null
}

export interface TerraDataSync {
  id: string
  user_id: string
  provider: string
  data_type: string
  sync_status: 'pending' | 'syncing' | 'completed' | 'failed'
  last_sync_at: string | null
  next_sync_at: string | null
  error_message: string | null
  sync_count: number
  created_at: string
}

export class TerraDataBaseSetup {
  
  // Initialize comprehensive Terra database schema
  static async initializeComprehensiveSchema(): Promise<void> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      await client.query('BEGIN')

      // Create enhanced wearable_connections table with Terra-specific fields
      await client.query(`
        CREATE TABLE IF NOT EXISTS wearable_connections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          provider VARCHAR(50) NOT NULL,
          terra_user_id VARCHAR(255) UNIQUE NOT NULL,
          connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_sync TIMESTAMP,
          scopes JSONB DEFAULT '[]'::jsonb,
          is_active BOOLEAN DEFAULT true,
          auth_expires_at TIMESTAMP,
          refresh_token TEXT,
          access_token TEXT,
          webhook_url TEXT,
          provider_display VARCHAR(100),
          provider_category VARCHAR(50),
          connection_metadata JSONB DEFAULT '{}'::jsonb,
          UNIQUE(user_id, provider)
        )
      `)

      // Create Terra providers registry table
      await client.query(`
        CREATE TABLE IF NOT EXISTS terra_providers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider_code VARCHAR(50) UNIQUE NOT NULL,
          provider_name VARCHAR(100) NOT NULL,
          category VARCHAR(50) NOT NULL,
          supported_data_types JSONB DEFAULT '[]'::jsonb,
          is_active BOOLEAN DEFAULT true,
          connection_instructions TEXT,
          auth_flow_type VARCHAR(20) DEFAULT 'oauth',
          rate_limits JSONB DEFAULT '{}'::jsonb,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create enhanced wearable_health_data table with proper alterations for existing tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS wearable_health_data (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          provider VARCHAR(50) NOT NULL,
          data_type VARCHAR(50) NOT NULL,
          data JSONB NOT NULL,
          recorded_at TIMESTAMP NOT NULL,
          synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, provider, data_type, recorded_at)
        )
      `)

      // Add new columns to existing table if they don't exist
      try {
        await client.query(`ALTER TABLE wearable_health_data ADD COLUMN IF NOT EXISTS terra_user_id VARCHAR(255)`)
        await client.query(`ALTER TABLE wearable_health_data ADD COLUMN IF NOT EXISTS data_hash VARCHAR(64)`)
        await client.query(`ALTER TABLE wearable_health_data ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) DEFAULT 'terra'`)
        await client.query(`ALTER TABLE wearable_health_data ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 100`)
        await client.query(`ALTER TABLE wearable_health_data ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'processed'`)
      } catch (error) {
        console.log('Note: Some columns may already exist:', error instanceof Error ? error.message : 'Unknown error')
      }

      // Create Terra webhook events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS terra_webhook_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID,
          terra_user_id VARCHAR(255) NOT NULL,
          provider VARCHAR(50) NOT NULL,
          event_type VARCHAR(50) NOT NULL,
          data_type VARCHAR(50),
          webhook_data JSONB NOT NULL,
          processed BOOLEAN DEFAULT false,
          received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          webhook_signature VARCHAR(255)
        )
      `)

      // Create Terra data sync tracking table
      await client.query(`
        CREATE TABLE IF NOT EXISTS terra_data_sync (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          provider VARCHAR(50) NOT NULL,
          data_type VARCHAR(50) NOT NULL,
          sync_status VARCHAR(20) DEFAULT 'pending',
          last_sync_at TIMESTAMP,
          next_sync_at TIMESTAMP,
          error_message TEXT,
          sync_count INTEGER DEFAULT 0,
          backoff_until TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, provider, data_type)
        )
      `)

      // Create enhanced daily health summary table
      await client.query(`
        CREATE TABLE IF NOT EXISTS daily_health_summary (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          date DATE NOT NULL,
          provider VARCHAR(50) NOT NULL,
          steps INTEGER,
          calories_burned INTEGER,
          calories_consumed INTEGER,
          distance FLOAT,
          floors_climbed INTEGER,
          sleep_duration INTEGER,
          sleep_efficiency FLOAT,
          sleep_score INTEGER,
          resting_heart_rate INTEGER,
          max_heart_rate INTEGER,
          avg_heart_rate INTEGER,
          hrv_score FLOAT,
          active_minutes INTEGER,
          sedentary_minutes INTEGER,
          stress_score INTEGER,
          mood_score INTEGER,
          energy_score INTEGER,
          readiness_score INTEGER,
          temperature FLOAT,
          spo2_avg FLOAT,
          weight FLOAT,
          body_fat_percentage FLOAT,
          muscle_mass FLOAT,
          hydration_level FLOAT,
          glucose_avg FLOAT,
          glucose_max FLOAT,
          glucose_min FLOAT,
          raw_data JSONB NOT NULL,
          data_quality INTEGER DEFAULT 100,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, provider, date)
        )
      `)

      // Create Terra API rate limiting table
      await client.query(`
        CREATE TABLE IF NOT EXISTS terra_rate_limits (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider VARCHAR(50) NOT NULL,
          endpoint VARCHAR(100) NOT NULL,
          user_id UUID,
          request_count INTEGER DEFAULT 1,
          window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          window_end TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '1 hour',
          last_request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(provider, endpoint, user_id, window_start)
        )
      `)

      // Create comprehensive indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_wearable_connections_user_provider_active 
        ON wearable_connections(user_id, provider, is_active, last_sync)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_wearable_connections_terra_user_id 
        ON wearable_connections(terra_user_id, is_active)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_wearable_health_data_user_provider_type_date 
        ON wearable_health_data(user_id, provider, data_type, recorded_at DESC)
      `)

      // Create data_hash index only if column exists
      try {
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_wearable_health_data_hash 
          ON wearable_health_data(data_hash) WHERE data_hash IS NOT NULL
        `)
      } catch (error) {
        console.log('Note: data_hash index creation skipped:', error instanceof Error ? error.message : 'Unknown error')
      }

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_terra_webhook_events_processed 
        ON terra_webhook_events(processed, received_at)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_terra_webhook_events_terra_user 
        ON terra_webhook_events(terra_user_id, provider, event_type)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_terra_data_sync_status_next 
        ON terra_data_sync(sync_status, next_sync_at)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_daily_health_summary_user_date_provider 
        ON daily_health_summary(user_id, date DESC, provider)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_terra_rate_limits_provider_endpoint_window 
        ON terra_rate_limits(provider, endpoint, window_start, window_end)
      `)

      // Create GIN indexes for JSONB fields
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_wearable_health_data_data_gin 
        ON wearable_health_data USING GIN(data)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_terra_webhook_events_data_gin 
        ON terra_webhook_events USING GIN(webhook_data)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_daily_health_summary_raw_data_gin 
        ON daily_health_summary USING GIN(raw_data)
      `)

      await client.query('COMMIT')
      console.log('✅ Comprehensive Terra database schema initialized')

    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Error initializing Terra database schema:', error)
      throw error
    } finally {
      client.release()
    }
  }

  // Populate Terra providers registry with core 4 devices only
  static async populateTerraProviders(): Promise<void> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      const providers = [
        // Core 4 Wearable Devices Only
        { code: 'GOOGLE', name: 'Google Fit', category: 'Fitness Apps', types: ['activity', 'sleep', 'heart_rate', 'body'] },
        { code: 'OURA', name: 'Oura Ring', category: 'Smart Rings', types: ['activity', 'sleep', 'heart_rate', 'body'] },
        { code: 'APPLE', name: 'Apple Watch', category: 'Smart Watches', types: ['activity', 'sleep', 'heart_rate', 'body', 'nutrition'] },
        { code: 'SAMSUNG', name: 'Samsung Watch', category: 'Smart Watches', types: ['activity', 'sleep', 'heart_rate', 'body'] }
      ]

      for (const provider of providers) {
        await client.query(`
          INSERT INTO terra_providers (
            provider_code, provider_name, category, supported_data_types, 
            is_active, metadata
          )
          VALUES ($1, $2, $3, $4, true, $5)
          ON CONFLICT (provider_code) 
          DO UPDATE SET
            provider_name = EXCLUDED.provider_name,
            category = EXCLUDED.category,
            supported_data_types = EXCLUDED.supported_data_types,
            metadata = EXCLUDED.metadata,
            updated_at = CURRENT_TIMESTAMP
        `, [
          provider.code,
          provider.name,
          provider.category,
          JSON.stringify(provider.types),
          JSON.stringify({ 
            last_updated: new Date().toISOString(),
            capabilities: provider.types 
          })
        ])
      }

      console.log(`✅ Terra providers registry populated with ${providers.length} providers`)

    } catch (error) {
      console.error('Error populating Terra providers:', error)
      throw error
    } finally {
      client.release()
    }
  }

  // Enhanced connection pool validation for high-load scenarios
  static async validateConnectionPool(): Promise<void> {
    try {
      // Test multiple concurrent connections using DatabasePool.getClient()
      const testConnections = []
      for (let i = 0; i < 10; i++) {
        testConnections.push(DatabasePool.getClient())
      }
      
      const clients = await Promise.all(testConnections)
      
      // Test concurrent queries
      const testQueries = clients.map((client, index) => 
        client.query('SELECT $1 as test_id, NOW() as timestamp', [index])
      )
      
      const results = await Promise.all(testQueries)
      
      // Release all clients
      clients.forEach(client => client.release())
      
      console.log(`✅ Connection pool validated with ${clients.length} concurrent connections`)
      
    } catch (error) {
      console.error('Connection pool validation failed:', error)
      throw error
    }
  }

  // Complete initialization method
  static async initializeComplete(): Promise<void> {
    console.log('🚀 Initializing comprehensive Terra database infrastructure...')
    
    try {
      // Step 1: Validate connection pool
      await this.validateConnectionPool()
      
      // Step 2: Initialize schema
      await this.initializeComprehensiveSchema()
      
      // Step 3: Populate providers
      await this.populateTerraProviders()
      
      // Step 4: Initialize existing WearablesDatabase schema for compatibility
      const { WearablesDatabase } = await import('./wearables-database')
      await WearablesDatabase.initializeSchema()
      
      console.log('✅ Complete Terra database infrastructure initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize Terra database infrastructure:', error)
      throw error
    }
  }
}

export default TerraDataBaseSetup