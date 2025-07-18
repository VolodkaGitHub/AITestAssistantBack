import { DatabasePool } from './database-pool';

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

export interface RateLimitResult {
  allowed: boolean
  resetTime: Date
  remaining: number
  total: number
}

class RateLimiter {
  private static instance: RateLimiter
  private dbPool: DatabasePool

  private constructor() {
    this.dbPool = DatabasePool.getInstance()
    this.initializeDatabase()
    this.startCleanupSchedule()
  }

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter()
    }
    return RateLimiter.instance
  }

  private async initializeDatabase() {
    try {
      // Drop and recreate table to fix constraint issues
      const client = await DatabasePool.getClient()
      try {
        await client.query(`DROP TABLE IF EXISTS rate_limits`)
      
        await client.query(`
          CREATE TABLE rate_limits (
            identifier VARCHAR(255) NOT NULL,
            endpoint VARCHAR(255) NOT NULL,
            window_start TIMESTAMP WITH TIME ZONE NOT NULL,
            request_count INTEGER DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            PRIMARY KEY (identifier, endpoint, window_start)
          )
        `)
      
        // Create index separately for PostgreSQL compatibility
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start 
          ON rate_limits(window_start)
        `)
      } finally {
        client.release()
      }
      console.log('Rate limiter table initialized')
    } catch (error) {
      console.error('Failed to initialize rate limiter table:', error)
    }
  }

  public async checkRateLimit(
    identifier: string, 
    endpoint: string, 
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = new Date()
    const windowStart = new Date(Math.floor(now.getTime() / config.windowMs) * config.windowMs)
    const resetTime = new Date(windowStart.getTime() + config.windowMs)

    try {
      // Upsert rate limit record
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(`
          INSERT INTO rate_limits (identifier, endpoint, window_start, request_count)
          VALUES ($1, $2, $3, 1)
          ON CONFLICT (identifier, endpoint, window_start)
          DO UPDATE SET 
            request_count = rate_limits.request_count + 1
          RETURNING request_count
        `, [identifier, endpoint, windowStart])
      } finally {
        client.release()
      }

      const currentCount = result.rows[0].request_count

      return {
        allowed: currentCount <= config.maxRequests,
        resetTime,
        remaining: Math.max(0, config.maxRequests - currentCount),
        total: config.maxRequests
      }
    } catch (error) {
      console.error('Rate limit check failed:', error)
      // Fail open - allow request if database is unavailable
      return {
        allowed: true,
        resetTime,
        remaining: config.maxRequests,
        total: config.maxRequests
      }
    }
  }

  private startCleanupSchedule() {
    // Clean up old rate limit records every 5 minutes
    setInterval(async () => {
      try {
        const client = await DatabasePool.getClient()
        let result
        try {
          result = await client.query(`
            DELETE FROM rate_limits 
            WHERE window_start < NOW() - INTERVAL '1 day'
          `)
        } finally {
          client.release()
        }
        
        if (result.rowCount && result.rowCount > 0) {
          console.log(`Cleaned up ${result.rowCount} old rate limit records`)
        }
      } catch (error) {
        console.error('Rate limit cleanup failed:', error)
      }
    }, 5 * 60 * 1000) // Every 5 minutes
  }
}

// Rate limit configurations for different endpoints
export const RATE_LIMITS = {
  SESSION_CREATE: { windowMs: 60 * 1000, maxRequests: 5 }, // 5 sessions per minute
  CHAT_MESSAGE: { windowMs: 60 * 1000, maxRequests: 30 }, // 30 messages per minute
  SYMPTOM_SEARCH: { windowMs: 60 * 1000, maxRequests: 60 }, // 60 searches per minute
  FILE_UPLOAD: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 uploads per minute
  DIFFERENTIAL_DIAGNOSIS: { windowMs: 60 * 1000, maxRequests: 20 }, // 20 diagnoses per minute
  GENERAL_API: { windowMs: 60 * 1000, maxRequests: 100 } // 100 general requests per minute
}

export default RateLimiter