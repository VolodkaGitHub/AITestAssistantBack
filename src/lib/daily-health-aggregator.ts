/**
 * Daily Health Aggregator - Consolidates enrichment scores into daily summaries
 * Creates unified per-user-per-day records for mentions functionality
 */

import { DatabasePool } from './database-pool';

export interface DailyHealthScore {
  id?: number
  user_id: string
  score_date: string
  
  // Sleep metrics
  sleep_score?: number
  sleep_contributors?: any
  
  // Stress metrics
  stress_score?: number
  stress_contributors?: any
  
  // Respiratory metrics
  respiratory_score?: number
  respiratory_contributors?: any
  
  // Metadata
  providers: string[]
  last_updated?: string
  created_at?: string
}

class DailyHealthAggregator {
  
  /**
   * Initialize daily health scores table schema
   */
  async initializeSchema(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS daily_health_scores (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        score_date DATE NOT NULL,
        
        -- Sleep metrics
        sleep_score NUMERIC(5,2),
        sleep_contributors JSONB,
        
        -- Stress metrics  
        stress_score NUMERIC(5,2),
        stress_contributors JSONB,
        
        -- Respiratory metrics
        respiratory_score NUMERIC(5,2),
        respiratory_contributors JSONB,
        
        -- Metadata
        providers TEXT[], -- Array of providers contributing to this day's data
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Ensure one record per user per day
        UNIQUE(user_id, score_date)
      );
      
      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_daily_health_user_date ON daily_health_scores(user_id, score_date);
      CREATE INDEX IF NOT EXISTS idx_daily_health_date ON daily_health_scores(score_date);
    `
    
    const client = await DatabasePool.getClient()
    try {
      await client.query(query)
    } finally {
      client.release()
    }
    console.log('✅ Daily health scores schema initialized')
  }

  /**
   * Aggregate enrichment scores for a specific user and date
   */
  async aggregateUserDayScores(userId: string, scoreDate: string): Promise<void> {
    try {
      // Using DatabasePool.getClient() directly
      
      // Get all Terra user IDs for this user
      const connectionQuery = `
        SELECT DISTINCT terra_user_id, provider 
        FROM wearable_connections 
        WHERE user_id = $1 AND is_active = true
      `
      const client = await DatabasePool.getClient()
      let connectionsResult, scoresResult
      try {
        connectionsResult = await client.query(connectionQuery, [userId])
        const terraUserIds = connectionsResult.rows.map(row => row.terra_user_id)
        const providers = connectionsResult.rows.map(row => row.provider)

        if (terraUserIds.length === 0) {
          console.log(`No active connections found for user ${userId}`)
          return
        }

      // Get enrichment scores for this date
      const scoresQuery = `
        SELECT 
          data_type,
          provider,
          sleep_score,
          stress_score,
          respiratory_score,
          sleep_contributors,
          stress_contributors,
          respiratory_contributors
        FROM enrichment_scores
        WHERE terra_user_id = ANY($1)
          AND DATE(summary_date) = $2
          AND (sleep_score IS NOT NULL OR stress_score IS NOT NULL OR respiratory_score IS NOT NULL)
        ORDER BY recorded_at DESC
      `
      
        scoresResult = await client.query(scoresQuery, [terraUserIds, scoreDate])
        const scores = scoresResult.rows

        if (scores.length === 0) {
          console.log(`No enrichment scores found for user ${userId} on ${scoreDate}`)
          return
        }

      // Calculate averages across all devices for each score type
      const sleepScores = scores.filter(s => s.sleep_score).map(s => parseFloat(s.sleep_score))
      const stressScores = scores.filter(s => s.stress_score).map(s => parseFloat(s.stress_score))
      const respiratoryScores = scores.filter(s => s.respiratory_score).map(s => parseFloat(s.respiratory_score))

      // Average the scores and merge contributors
      const aggregated = {
        sleep_score: null as number | null,
        sleep_contributors: null as any,
        stress_score: null as number | null,
        stress_contributors: null as any,
        respiratory_score: null as number | null,
        respiratory_contributors: null as any,
      }

      if (sleepScores.length > 0) {
        aggregated.sleep_score = parseFloat((sleepScores.reduce((sum, score) => sum + score, 0) / sleepScores.length).toFixed(2))
        // Merge sleep contributors from all devices
        const sleepContribData = scores.filter(s => s.sleep_score && s.sleep_contributors)
        aggregated.sleep_contributors = this.mergeContributors(sleepContribData.map(s => s.sleep_contributors), 'sleep')
      }

      if (stressScores.length > 0) {
        aggregated.stress_score = parseFloat((stressScores.reduce((sum, score) => sum + score, 0) / stressScores.length).toFixed(2))
        // Merge stress contributors from all devices
        const stressContribData = scores.filter(s => s.stress_score && s.stress_contributors)
        aggregated.stress_contributors = this.mergeContributors(stressContribData.map(s => s.stress_contributors), 'stress')
      }

      if (respiratoryScores.length > 0) {
        aggregated.respiratory_score = parseFloat((respiratoryScores.reduce((sum, score) => sum + score, 0) / respiratoryScores.length).toFixed(2))
        // Merge respiratory contributors from all devices
        const respiratoryContribData = scores.filter(s => s.respiratory_score && s.respiratory_contributors)
        aggregated.respiratory_contributors = this.mergeContributors(respiratoryContribData.map(s => s.respiratory_contributors), 'respiratory')
      }

      console.log(`📊 Device averaging for user ${userId} on ${scoreDate}:`, {
        devices: providers.length,
        sleepDevices: sleepScores.length,
        stressDevices: stressScores.length,
        respiratoryDevices: respiratoryScores.length,
        avgSleep: aggregated.sleep_score,
        avgStress: aggregated.stress_score,
        avgRespiratory: aggregated.respiratory_score
      })

      // Insert or update daily health score
      const upsertQuery = `
        INSERT INTO daily_health_scores (
          user_id,
          score_date,
          sleep_score,
          sleep_contributors,
          stress_score,
          stress_contributors,
          respiratory_score,
          respiratory_contributors,
          providers,
          last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, score_date)
        DO UPDATE SET
          sleep_score = EXCLUDED.sleep_score,
          sleep_contributors = EXCLUDED.sleep_contributors,
          stress_score = EXCLUDED.stress_score,
          stress_contributors = EXCLUDED.stress_contributors,
          respiratory_score = EXCLUDED.respiratory_score,
          respiratory_contributors = EXCLUDED.respiratory_contributors,
          providers = EXCLUDED.providers,
          last_updated = CURRENT_TIMESTAMP
      `

        await client.query(upsertQuery, [
          userId,
          scoreDate,
          aggregated.sleep_score,
          aggregated.sleep_contributors,
          aggregated.stress_score,
          aggregated.stress_contributors,
          aggregated.respiratory_score,
          aggregated.respiratory_contributors,
          providers
        ])

        console.log(`✅ Aggregated daily health scores for user ${userId} on ${scoreDate}:`, {
          sleep: aggregated.sleep_score,
          stress: aggregated.stress_score,
          respiratory: aggregated.respiratory_score
        })
        
      } finally {
        client.release()
      }

    } catch (error) {
      console.error(`Error aggregating daily health scores for ${userId} on ${scoreDate}:`, error)
    }
  }

  /**
   * Get daily health scores for a user within a date range
   */
  async getUserDailyScores(userId: string, startDate?: string, endDate?: string, limit: number = 30): Promise<DailyHealthScore[]> {
    try {
      // Using DatabasePool.getClient() directly
      let query = `
        SELECT * FROM daily_health_scores
        WHERE user_id = $1
      `
      const params: any[] = [userId]

      if (startDate) {
        query += ` AND score_date >= $${params.length + 1}`
        params.push(startDate)
      }

      if (endDate) {
        query += ` AND score_date <= $${params.length + 1}`
        params.push(endDate)
      }

      query += ` ORDER BY score_date DESC LIMIT $${params.length + 1}`
      params.push(limit)

      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(query, params)
      } finally {
        client.release()
      }
      
      return result.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        score_date: row.score_date,
        sleep_score: row.sleep_score ? parseFloat(row.sleep_score) : undefined,
        sleep_contributors: row.sleep_contributors,
        stress_score: row.stress_score ? parseFloat(row.stress_score) : undefined,
        stress_contributors: row.stress_contributors,
        respiratory_score: row.respiratory_score ? parseFloat(row.respiratory_score) : undefined,
        respiratory_contributors: row.respiratory_contributors,
        providers: row.providers,
        last_updated: row.last_updated,
        created_at: row.created_at
      }))

    } catch (error) {
      console.error('Error fetching user daily scores:', error)
      return []
    }
  }

  /**
   * Aggregate all existing enrichment scores into daily summaries
   */
  async backfillDailyScores(): Promise<void> {
    try {
      // Using DatabasePool.getClient() directly
      console.log('🔄 Starting daily health scores backfill...')

      // Get all unique user/date combinations from enrichment_scores
      const query = `
        SELECT DISTINCT 
          wc.user_id,
          DATE(es.summary_date) as score_date
        FROM enrichment_scores es
        JOIN wearable_connections wc ON es.terra_user_id = wc.terra_user_id
        WHERE es.summary_date IS NOT NULL
          AND (es.sleep_score IS NOT NULL OR es.stress_score IS NOT NULL OR es.respiratory_score IS NOT NULL)
        ORDER BY wc.user_id, score_date DESC
      `

      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(query)
      } finally {
        client.release()
      }
      console.log(`📊 Found ${result.rows.length} user/date combinations to process`)

      for (const row of result.rows) {
        await this.aggregateUserDayScores(row.user_id, row.score_date)
      }

      console.log('✅ Daily health scores backfill completed')

    } catch (error) {
      console.error('Error during backfill:', error)
    }
  }

  /**
   * Get latest daily health summary for mentions
   */
  async getLatestHealthSummary(userId: string): Promise<string> {
    try {
      // Using DatabasePool.getClient() directly
      const scores = await this.getUserDailyScores(userId, undefined, undefined, 1)
      
      if (scores.length === 0) {
        return "No recent health data available"
      }

      const latest = scores[0]
      const parts: string[] = []

      if (latest.sleep_score) {
        const contributors = latest.sleep_contributors
        parts.push(`Sleep Score: ${latest.sleep_score}/100 (REM: ${contributors?.rem || 'N/A'}, Deep: ${contributors?.deep || 'N/A'}, Light: ${contributors?.light || 'N/A'}, Efficiency: ${contributors?.efficiency || 'N/A'}%)`)
      }

      if (latest.stress_score) {
        const contributors = latest.stress_contributors
        parts.push(`Stress Score: ${latest.stress_score}/100 (HR: ${contributors?.hr || 'N/A'}, HRV: ${contributors?.hrv || 'N/A'}, Sleep: ${contributors?.sleep || 'N/A'}, Steps: ${contributors?.steps || 'N/A'})`)
      }

      if (latest.respiratory_score) {
        const contributors = latest.respiratory_contributors
        const oxyValue = contributors?.oxygen_saturation || contributors?.oxy || 'N/A'
        const breathingValue = contributors?.breathing_regularity || contributors?.respiration || 'N/A'
        parts.push(`Respiratory Score: ${latest.respiratory_score}/100 (O₂ Sat: ${oxyValue}%, Breathing: ${breathingValue})`)
      }

      return parts.length > 0 ? 
        `Latest Health Data (${latest.score_date}): ${parts.join(' | ')}` :
        "No health metrics available"

    } catch (error) {
      console.error('Error getting health summary:', error)
      return "Error retrieving health data"
    }
  }

  /**
   * Merge contributors from multiple devices by averaging numerical values
   */
  private mergeContributors(contributorsList: any[], scoreType: string): any {
    if (!contributorsList || contributorsList.length === 0) return {}
    
    if (contributorsList.length === 1) return contributorsList[0]

    const merged: any = {}
    const contributorCounts: any = {}

    // Collect all contributor values
    for (const contributors of contributorsList) {
      if (!contributors) continue
      
      for (const [key, value] of Object.entries(contributors)) {
        if (typeof value === 'number') {
          if (!merged[key]) {
            merged[key] = 0
            contributorCounts[key] = 0
          }
          merged[key] += value
          contributorCounts[key]++
        } else {
          // For non-numeric values, take the first available
          if (!merged[key]) {
            merged[key] = value
          }
        }
      }
    }

    // Average the numerical values
    for (const key of Object.keys(merged)) {
      if (contributorCounts[key] > 0) {
        merged[key] = parseFloat((merged[key] / contributorCounts[key]).toFixed(1))
      }
    }

    return merged
  }
}

export const dailyHealthAggregator = new DailyHealthAggregator()