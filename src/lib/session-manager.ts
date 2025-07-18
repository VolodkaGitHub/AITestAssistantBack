import { DatabasePool } from './database-pool';
import { getValidJWTToken } from './jwt-manager'

export interface UserSession {
  sessionId: string
  userId: string
  userEmail: string
  merlinSessionId?: string
  createdAt: Date
  lastActivity: Date
  differentialDiagnosis?: any[]
  patientData?: any
  conversationHistory?: any[]
}

export interface SessionMetrics {
  activeUsers: number
  totalSessions: number
  averageSessionDuration: number
  peakConcurrentUsers: number
}

class SessionManager {
  private static instance: SessionManager

  private constructor() {
    this.initializeDatabase()
    this.startCleanupSchedule()
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  private async initializeDatabase() {
    try {
      const client = await DatabasePool.getClient()
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS user_sessions (
            session_id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            user_email VARCHAR(255) NOT NULL,
            merlin_session_id VARCHAR(255),
            patient_data JSONB,
            differential_diagnosis JSONB,
            conversation_history JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
          )
        `)

        // Create indexes separately for PostgreSQL compatibility
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_user_sessions_email_created
          ON user_sessions(user_email, created_at)
        `)

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity
          ON user_sessions(last_activity)
        `)

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
          ON user_sessions(expires_at)
        `)

        await client.query(`
          CREATE TABLE IF NOT EXISTS session_metrics (
            metric_date DATE DEFAULT CURRENT_DATE,
            hour_bucket INTEGER DEFAULT EXTRACT(HOUR FROM NOW()),
            active_users INTEGER DEFAULT 0,
            total_sessions INTEGER DEFAULT 0,
            peak_concurrent INTEGER DEFAULT 0,
            PRIMARY KEY (metric_date, hour_bucket)
          )
        `)
      } finally {
        client.release()
      }

      console.log('Session management tables initialized')
    } catch (error) {
      console.error('Failed to initialize session tables:', error)
    }
  }

  public async createSession(userId: string, userEmail: string, patientData?: any): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      const client = await DatabasePool.getClient()
      try {
        await client.query(`
          INSERT INTO user_sessions (
            session_id, user_id, user_email, patient_data, created_at, last_activity
          ) VALUES ($1, $2, $3, $4, NOW(), NOW())
        `, [sessionId, userId, userEmail, patientData ? JSON.stringify(patientData) : null])
      } finally {
        client.release()
      }

      await this.updateMetrics()

      console.log(`Session created for user ${userEmail}: ${sessionId}`)
      return sessionId
    } catch (error) {
      console.error('Failed to create session:', error)
      throw new Error('Session creation failed')
    }
  }

  public async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(`
          SELECT * FROM user_sessions 
          WHERE session_id = $1 AND expires_at > NOW()
        `, [sessionId])
      } finally {
        client.release()
      }

      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      return {
        sessionId: row.session_id,
        userId: row.user_id,
        userEmail: row.user_email,
        merlinSessionId: row.merlin_session_id,
        createdAt: row.created_at,
        lastActivity: row.last_activity,
        differentialDiagnosis: row.differential_diagnosis,
        patientData: row.patient_data,
        conversationHistory: row.conversation_history || []
      }
    } catch (error) {
      console.error('Failed to get session:', error)
      return null
    }
  }

  public async updateSession(sessionId: string, updates: Partial<UserSession>) {
    try {
      const updateFields: string[] = []
      const values: any[] = []
      let paramIndex = 1

      if (updates.merlinSessionId) {
        updateFields.push(`merlin_session_id = $${paramIndex++}`)
        values.push(updates.merlinSessionId)
      }

      if (updates.differentialDiagnosis) {
        updateFields.push(`differential_diagnosis = $${paramIndex++}`)
        values.push(JSON.stringify(updates.differentialDiagnosis))
      }

      if (updates.conversationHistory) {
        updateFields.push(`conversation_history = $${paramIndex++}`)
        values.push(JSON.stringify(updates.conversationHistory))
      }

      // Always update last activity
      updateFields.push(`last_activity = NOW()`)
      values.push(sessionId)

      if (updateFields.length > 1) { // More than just last_activity
        const client = await DatabasePool.getClient()
        try {
          await client.query(`
            UPDATE user_sessions 
            SET ${updateFields.join(', ')}
            WHERE session_id = $${paramIndex}
          `, values)
        } finally {
          client.release()
        }
      }
    } catch (error) {
      console.error('Failed to update session:', error)
    }
  }

  public async getUserSessions(userEmail: string, limit: number = 10): Promise<UserSession[]> {
    try {
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(`
          SELECT * FROM user_sessions 
          WHERE user_email = $1 AND expires_at > NOW()
          ORDER BY last_activity DESC
          LIMIT $2
        `, [userEmail, limit])
      } finally {
        client.release()
      }

      return result.rows.map(row => ({
        sessionId: row.session_id,
        userId: row.user_id,
        userEmail: row.user_email,
        merlinSessionId: row.merlin_session_id,
        createdAt: row.created_at,
        lastActivity: row.last_activity,
        differentialDiagnosis: row.differential_diagnosis,
        patientData: row.patient_data,
        conversationHistory: row.conversation_history || []
      }))
    } catch (error) {
      console.error('Failed to get user sessions:', error)
      return []
    }
  }

  public async deleteSession(sessionId: string): Promise<void> {
    try {
      const client = await DatabasePool.getClient()
      try {
        await client.query(`
          DELETE FROM user_sessions WHERE session_id = $1
        `, [sessionId])
      } finally {
        client.release()
      }

      console.log(`Session deleted: ${sessionId}`)
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  public async getMetrics(): Promise<SessionMetrics> {
    try {
      const client = await DatabasePool.getClient()
      let activeResult, totalResult, avgDurationResult, peakResult
      try {
        activeResult = await client.query(`
          SELECT COUNT(DISTINCT user_email) as active_users
          FROM user_sessions 
          WHERE last_activity > NOW() - INTERVAL '1 hour'
        `)

        totalResult = await client.query(`
          SELECT COUNT(*) as total_sessions
          FROM user_sessions 
          WHERE created_at > CURRENT_DATE
        `)

        avgDurationResult = await client.query(`
          SELECT AVG(EXTRACT(EPOCH FROM (last_activity - created_at))/60) as avg_duration
          FROM user_sessions 
          WHERE created_at > CURRENT_DATE
        `)

        peakResult = await client.query(`
          SELECT MAX(peak_concurrent) as peak_concurrent
          FROM session_metrics
          WHERE metric_date = CURRENT_DATE
        `)
      } finally {
        client.release()
      }

      return {
        activeUsers: parseInt(activeResult.rows[0]?.active_users || '0'),
        totalSessions: parseInt(totalResult.rows[0]?.total_sessions || '0'),
        averageSessionDuration: parseFloat(avgDurationResult.rows[0]?.avg_duration || '0'),
        peakConcurrentUsers: parseInt(peakResult.rows[0]?.peak_concurrent || '0')
      }
    } catch (error) {
      console.error('Failed to get metrics:', error)
      return {
        activeUsers: 0,
        totalSessions: 0,
        averageSessionDuration: 0,
        peakConcurrentUsers: 0
      }
    }
  }

  private async updateMetrics() {
    try {
      const currentHour = new Date().getHours()
      const client = await DatabasePool.getClient()
      let activeUsers, totalSessions
      try {
        activeUsers = await client.query(`
          SELECT COUNT(DISTINCT user_email) as count
          FROM user_sessions 
          WHERE last_activity > NOW() - INTERVAL '1 hour'
        `)

        totalSessions = await client.query(`
          SELECT COUNT(*) as count
          FROM user_sessions 
          WHERE created_at > CURRENT_DATE
        `)

        await client.query(`
          INSERT INTO session_metrics (
            metric_date, hour_bucket, active_users, total_sessions, peak_concurrent
          ) VALUES (
            CURRENT_DATE, $1, $2, $3, $2
          ) ON CONFLICT (metric_date, hour_bucket) 
          DO UPDATE SET 
            active_users = $2,
            total_sessions = $3,
            peak_concurrent = GREATEST(session_metrics.peak_concurrent, $2)
        `, [currentHour, activeUsers.rows[0].count, totalSessions.rows[0].count])
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Failed to update metrics:', error)
    }
  }

  private startCleanupSchedule() {
    // Clean up expired sessions every hour
    setInterval(async () => {
      try {
        const client = await DatabasePool.getClient()
        let result
        try {
          result = await client.query(`
            DELETE FROM user_sessions 
            WHERE expires_at < NOW()
          `)
        } finally {
          client.release()
        }

        if (result.rowCount && result.rowCount > 0) {
          console.log(`Cleaned up ${result.rowCount} expired sessions`)
        }
      } catch (error) {
        console.error('Session cleanup failed:', error)
      }
    }, 60 * 60 * 1000) // Every hour
  }
}

export default SessionManager