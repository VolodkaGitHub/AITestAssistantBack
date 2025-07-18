import axios from 'axios'
import { DatabasePool } from './database-pool';

interface JWTTokenCache {
  token: string
  expiresAt: number
  userId: string
}

class UserSpecificJWTManager {
  private static instance: UserSpecificJWTManager
  private dbPool: DatabasePool
  private TOKEN_REFRESH_BUFFER = 5 * 60 * 1000 // 5 minutes before expiry

  private constructor() {
    this.dbPool = DatabasePool.getInstance()
    this.initializeDatabase()
  }

  public static getInstance(): UserSpecificJWTManager {
    if (!UserSpecificJWTManager.instance) {
      UserSpecificJWTManager.instance = new UserSpecificJWTManager()
    }
    return UserSpecificJWTManager.instance
  }

  private async initializeDatabase() {
    try {
      const client = await DatabasePool.getClient()
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS user_jwt_tokens (
            user_id VARCHAR(255) PRIMARY KEY,
            token TEXT NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `)
        
        // Create indexes separately for PostgreSQL
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_user_jwt_tokens_expires_at 
          ON user_jwt_tokens(expires_at)
        `)
        
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_user_jwt_tokens_last_used 
          ON user_jwt_tokens(last_used)
        `)
      } finally {
        client.release()
      }
      console.log('User JWT token table initialized')
    } catch (error) {
      console.error('Failed to initialize JWT token table:', error)
    }
  }

  public async getValidJWTToken(userId: string): Promise<string> {
    const now = Date.now()
    
    try {
      // Check database for valid cached token
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(`
          SELECT token, EXTRACT(EPOCH FROM expires_at) * 1000 as expires_at_ms
          FROM user_jwt_tokens 
          WHERE user_id = $1 AND expires_at > NOW() + INTERVAL '5 minutes'
        `, [userId])

        if (result.rows.length > 0) {
          const cachedToken = result.rows[0]
          // Update last used timestamp
          await client.query(`
            UPDATE user_jwt_tokens 
            SET last_used = NOW() 
            WHERE user_id = $1
          `, [userId])
          
          console.log(`Using cached JWT token for user ${userId}`)
          return cachedToken.token
        }
      } finally {
        client.release()
      }

      // Need to refresh token
      console.log(`Refreshing JWT token for user ${userId}...`)
      
      const response = await axios.post(`${process.env.NEXTAUTH_URL || 'https://treatmentglm.replit.app'}/api/auth/jwt`, {}, {
        timeout: 10000,
        headers: {
          'User-Context': userId // Pass user context for audit trails
        }
      })
      
      const { access_token, expires_in } = response.data
      const expiresAt = new Date(now + (expires_in * 1000))
      
      // Store token in database
      const storeClient = await DatabasePool.getClient()
      try {
        await storeClient.query(`
          INSERT INTO user_jwt_tokens (user_id, token, expires_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id) 
          DO UPDATE SET 
            token = $2,
            expires_at = $3,
            last_used = NOW()
        `, [userId, access_token, expiresAt])
      } finally {
        storeClient.release()
      }
      
      console.log(`Fresh JWT token obtained for user ${userId}, expires at:`, expiresAt.toISOString())
      return access_token
      
    } catch (error) {
      console.error(`Failed to refresh JWT token for user ${userId}:`, error)
      throw new Error('JWT token refresh failed')
    }
  }

  public async clearUserTokenCache(userId: string): Promise<void> {
    try {
      const client = await DatabasePool.getClient()
      try {
        await client.query(`
          DELETE FROM user_jwt_tokens WHERE user_id = $1
        `, [userId])
      } finally {
        client.release()
      }
      console.log(`JWT token cache cleared for user ${userId}`)
    } catch (error) {
      console.error(`Failed to clear token cache for user ${userId}:`, error)
    }
  }

  public async getUserTokenInfo(userId: string): Promise<{ hasToken: boolean; expiresAt?: string }> {
    try {
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(`
          SELECT expires_at FROM user_jwt_tokens 
          WHERE user_id = $1 AND expires_at > NOW()
        `, [userId])
      } finally {
        client.release()
      }

      if (result.rows.length === 0) {
        return { hasToken: false }
      }

      return {
        hasToken: true,
        expiresAt: result.rows[0].expires_at.toISOString()
      }
    } catch (error) {
      console.error(`Failed to get token info for user ${userId}:`, error)
      return { hasToken: false }
    }
  }

  public async cleanupExpiredTokens(): Promise<void> {
    try {
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(`
          DELETE FROM user_jwt_tokens 
          WHERE expires_at < NOW()
        `)
      } finally {
        client.release()
      }
      
      if (result.rowCount && result.rowCount > 0) {
        console.log(`Cleaned up ${result.rowCount} expired JWT tokens`)
      }
    } catch (error) {
      console.error('Failed to cleanup expired tokens:', error)
    }
  }

  public async getTokenUsageStats(): Promise<{
    totalUsers: number
    activeTokens: number
    expiredTokens: number
  }> {
    try {
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(`
          SELECT 
            COUNT(*) as total_users,
            COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active_tokens,
            COUNT(CASE WHEN expires_at <= NOW() THEN 1 END) as expired_tokens
          FROM user_jwt_tokens
        `)
      } finally {
        client.release()
      }

      const stats = result.rows[0]
      return {
        totalUsers: parseInt(stats.total_users || '0'),
        activeTokens: parseInt(stats.active_tokens || '0'),
        expiredTokens: parseInt(stats.expired_tokens || '0')
      }
    } catch (error) {
      console.error('Failed to get token usage stats:', error)
      return { totalUsers: 0, activeTokens: 0, expiredTokens: 0 }
    }
  }
}

export default UserSpecificJWTManager