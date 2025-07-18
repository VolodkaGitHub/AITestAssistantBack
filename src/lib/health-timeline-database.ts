import { Pool } from 'pg'

interface HealthTimelineEntry {
  id?: string
  userId: string
  sessionId: string
  date: string
  symptoms: string[]
  findings: string
  topDifferentialDiagnoses: {
    condition: string
    probability: number
    medicalTerm: string
    laymanTerm: string
  }[]
  chatSummary: string
  fullChatHistory?: any[]
  createdAt?: Date
  updatedAt?: Date
}

interface ChatSummaryData {
  symptoms: string[]
  findings: string
  differentialDiagnoses: any[]
  chatHistory: any[]
  sessionId: string
}

class HealthTimelineDatabase {
  private pool: Pool

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    })
  }

  async initializeSchema(): Promise<void> {
    const client = await this.pool.connect()
    
    try {
      // Create health_timeline table
      await client.query(`
        CREATE TABLE IF NOT EXISTS health_timeline (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_id VARCHAR(255) NOT NULL,
          date DATE NOT NULL,
          symptoms JSONB NOT NULL DEFAULT '[]',
          findings TEXT NOT NULL,
          top_differential_diagnoses JSONB NOT NULL DEFAULT '[]',
          chat_summary TEXT NOT NULL,
          full_chat_history JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_health_timeline_user_id 
        ON health_timeline(user_id)
      `)
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_health_timeline_date 
        ON health_timeline(user_id, date DESC)
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_health_timeline_session_id 
        ON health_timeline(session_id)
      `)

      console.log('Health Timeline database schema initialized successfully')
    } catch (error) {
      console.error('Error initializing Health Timeline schema:', error)
      throw error
    } finally {
      client.release()
    }
  }

  async saveHealthTimelineEntry(entry: HealthTimelineEntry): Promise<string> {
    const client = await this.pool.connect()
    
    try {
      const result = await client.query(`
        INSERT INTO health_timeline (
          user_id, session_id, date, symptoms, findings, 
          top_differential_diagnoses, chat_summary, full_chat_history
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        entry.userId,
        entry.sessionId,
        entry.date,
        JSON.stringify(entry.symptoms),
        entry.findings,
        JSON.stringify(entry.topDifferentialDiagnoses),
        entry.chatSummary,
        entry.fullChatHistory ? JSON.stringify(entry.fullChatHistory) : null
      ])

      return result.rows[0].id
    } catch (error) {
      console.error('Error saving health timeline entry:', error)
      throw error
    } finally {
      client.release()
    }
  }

  async getUserHealthTimeline(userId: string, limit: number = 50): Promise<HealthTimelineEntry[]> {
    const client = await this.pool.connect()
    
    try {
      const result = await client.query(`
        SELECT 
          id,
          user_id as "userId",
          session_id as "sessionId",
          date,
          symptoms,
          findings,
          top_differential_diagnoses as "topDifferentialDiagnoses",
          chat_summary as "chatSummary",
          full_chat_history as "fullChatHistory",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM health_timeline 
        WHERE user_id = $1 
        ORDER BY date DESC, created_at DESC 
        LIMIT $2
      `, [userId, limit])

      return result.rows.map(row => ({
        ...row,
        symptoms: typeof row.symptoms === 'string' ? JSON.parse(row.symptoms) : row.symptoms,
        topDifferentialDiagnoses: typeof row.topDifferentialDiagnoses === 'string' 
          ? JSON.parse(row.topDifferentialDiagnoses) 
          : row.topDifferentialDiagnoses,
        fullChatHistory: typeof row.fullChatHistory === 'string' 
          ? JSON.parse(row.fullChatHistory) 
          : row.fullChatHistory
      }))
    } catch (error) {
      console.error('Error retrieving user health timeline:', error)
      throw error
    } finally {
      client.release()
    }
  }

  async getHealthTimelineEntry(entryId: string, userId: string): Promise<HealthTimelineEntry | null> {
    const client = await this.pool.connect()
    
    try {
      const result = await client.query(`
        SELECT 
          id,
          user_id as "userId",
          session_id as "sessionId",
          date,
          symptoms,
          findings,
          top_differential_diagnoses as "topDifferentialDiagnoses",
          chat_summary as "chatSummary",
          full_chat_history as "fullChatHistory",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM health_timeline 
        WHERE id = $1 AND user_id = $2
      `, [entryId, userId])

      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      return {
        ...row,
        symptoms: typeof row.symptoms === 'string' ? JSON.parse(row.symptoms) : row.symptoms,
        topDifferentialDiagnoses: typeof row.topDifferentialDiagnoses === 'string' 
          ? JSON.parse(row.topDifferentialDiagnoses) 
          : row.topDifferentialDiagnoses,
        fullChatHistory: typeof row.fullChatHistory === 'string' 
          ? JSON.parse(row.fullChatHistory) 
          : row.fullChatHistory
      }
    } catch (error) {
      console.error('Error retrieving health timeline entry:', error)
      throw error
    } finally {
      client.release()
    }
  }

  async deleteHealthTimelineEntry(entryId: string, userId: string): Promise<boolean> {
    const client = await this.pool.connect()
    
    try {
      const result = await client.query(`
        DELETE FROM health_timeline 
        WHERE id = $1 AND user_id = $2
      `, [entryId, userId])

      return (result.rowCount || 0) > 0
    } catch (error) {
      console.error('Error deleting health timeline entry:', error)
      throw error
    } finally {
      client.release()
    }
  }

  async updateHealthTimelineEntry(entryId: string, userId: string, updates: Partial<HealthTimelineEntry>): Promise<boolean> {
    const client = await this.pool.connect()
    
    try {
      const setClause = []
      const values = []
      let paramIndex = 3

      if (updates.symptoms) {
        setClause.push(`symptoms = $${paramIndex}`)
        values.push(JSON.stringify(updates.symptoms))
        paramIndex++
      }

      if (updates.findings) {
        setClause.push(`findings = $${paramIndex}`)
        values.push(updates.findings)
        paramIndex++
      }

      if (updates.topDifferentialDiagnoses) {
        setClause.push(`top_differential_diagnoses = $${paramIndex}`)
        values.push(JSON.stringify(updates.topDifferentialDiagnoses))
        paramIndex++
      }

      if (updates.chatSummary) {
        setClause.push(`chat_summary = $${paramIndex}`)
        values.push(updates.chatSummary)
        paramIndex++
      }

      if (updates.fullChatHistory) {
        setClause.push(`full_chat_history = $${paramIndex}`)
        values.push(JSON.stringify(updates.fullChatHistory))
        paramIndex++
      }

      if (setClause.length === 0) {
        return false
      }

      setClause.push(`updated_at = CURRENT_TIMESTAMP`)

      const result = await client.query(`
        UPDATE health_timeline 
        SET ${setClause.join(', ')}
        WHERE id = $1 AND user_id = $2
      `, [entryId, userId, ...values])

      return (result.rowCount || 0) > 0
    } catch (error) {
      console.error('Error updating health timeline entry:', error)
      throw error
    } finally {
      client.release()
    }
  }

  async getHealthTimelineStats(userId: string): Promise<{
    totalEntries: number
    lastEntry: Date | null
    mostCommonSymptoms: { symptom: string; count: number }[]
  }> {
    const client = await this.pool.connect()
    
    try {
      // Get total entries
      const totalResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM health_timeline 
        WHERE user_id = $1
      `, [userId])

      // Get last entry date
      const lastEntryResult = await client.query(`
        SELECT MAX(date) as last_date 
        FROM health_timeline 
        WHERE user_id = $1
      `, [userId])

      // Get most common symptoms
      const symptomsResult = await client.query(`
        SELECT 
          symptom,
          COUNT(*) as count
        FROM health_timeline 
        CROSS JOIN LATERAL jsonb_array_elements_text(symptoms) AS symptom
        WHERE user_id = $1
        GROUP BY symptom
        ORDER BY count DESC
        LIMIT 5
      `, [userId])

      return {
        totalEntries: parseInt(totalResult.rows[0].count),
        lastEntry: lastEntryResult.rows[0].last_date,
        mostCommonSymptoms: symptomsResult.rows
      }
    } catch (error) {
      console.error('Error retrieving health timeline stats:', error)
      throw error
    } finally {
      client.release()
    }
  }
}

export const healthTimelineDB = new HealthTimelineDatabase()
export type { HealthTimelineEntry, ChatSummaryData }