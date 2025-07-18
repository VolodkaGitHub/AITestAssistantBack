/**
 * Static Conditions Database
 * One-time population from Merlin API, then used for user selections
 */

import { DatabasePool } from './database-pool';

export interface ConditionEntry {
  id: string
  name: string
  icd10_code?: string
  category?: string
  description?: string
  symptoms?: string[]
  related_conditions?: string[]
  severity_levels?: string[]
  common_treatments?: string[]
  risk_factors?: string[]
  created_at?: string
  updated_at?: string
}

class ConditionsDatabase {

  /**
   * Initialize conditions database schema
   */
  async initializeSchema(): Promise<void> {
    // Using DatabasePool.getClient() directly
    const query = `
      CREATE TABLE IF NOT EXISTS conditions_master (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        icd10_code VARCHAR(20),
        category VARCHAR(255),
        description TEXT,
        symptoms TEXT[], -- Array of common symptoms
        related_conditions TEXT[], -- Array of related condition names
        severity_levels TEXT[], -- Array of severity classifications
        common_treatments TEXT[], -- Array of common treatment approaches
        risk_factors TEXT[], -- Array of risk factors
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for fast searching
      CREATE INDEX IF NOT EXISTS idx_conditions_name ON conditions_master(name);
      CREATE INDEX IF NOT EXISTS idx_conditions_icd10 ON conditions_master(icd10_code);
      CREATE INDEX IF NOT EXISTS idx_conditions_category ON conditions_master(category);

      -- Track population status
      CREATE TABLE IF NOT EXISTS conditions_sync_log (
        id SERIAL PRIMARY KEY,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        conditions_count INTEGER,
        sync_source VARCHAR(100),
        sync_status VARCHAR(50),
        error_details TEXT
      );
    `
    
    const client = await DatabasePool.getClient()
    try {
      await client.query(query)
    } finally {
      client.release()
    }
    console.log('✅ Conditions master database schema initialized')
  }

  /**
   * Check if conditions database has been populated
   */
  async isPopulated(): Promise<boolean> {
    try {
      // Using DatabasePool.getClient() directly
      const countQuery = 'SELECT COUNT(*) as count FROM conditions_master'
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(countQuery)
      } finally {
        client.release()
      }
      const count = parseInt(result.rows[0].count)
      
      // Consider populated if we have any conditions
      return count > 0
    } catch (error) {
      console.error('Error checking conditions count:', error)
      return false
    }
  }

  /**
   * Populate conditions database from Merlin API (one-time full population)
   */
  async populateFromMerlin(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      console.log('🏥 Starting full conditions population from Merlin API...')
      
      // Check if already populated
      const alreadyPopulated = await this.isPopulated()
      if (alreadyPopulated) {
        const count = await this.getConditionsCount()
        console.log(`📋 Conditions database already populated with ${count} entries`)
        return { success: true, count }
      }

      // Make actual Merlin API call to get all conditions
      const merlinConditions = await this.fetchAllConditionsFromMerlin()
      
      let insertedCount = 0
      for (const condition of merlinConditions) {
        try {
          await this.insertCondition(condition)
          insertedCount++
        } catch (error) {
          console.error(`Error inserting condition ${condition.name}:`, error)
        }
      }

      // Log the successful sync
      await this.logSync(insertedCount, 'merlin_api', 'success')
      
      console.log(`✅ Populated conditions database with ${insertedCount} conditions from Merlin API`)
      return { success: true, count: insertedCount }

    } catch (error) {
      console.error('Error populating conditions from Merlin:', error)
      await this.logSync(0, 'merlin_api', 'failed', error instanceof Error ? error.message : 'Unknown error')
      return { 
        success: false, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Fetch all conditions from Merlin API using JWT authentication
   */
  private async fetchAllConditionsFromMerlin(): Promise<ConditionEntry[]> {
    console.log('📡 Fetching all conditions from Merlin API...')
    
    try {
      // Get JWT token first
      const jwtToken = await this.getJWTToken()
      
      // Use correct Merlin endpoint
      const merlinUrl = 'https://merlin-394631772515.us-central1.run.app'
      
      // Fetch conditions from Merlin conditions list (using correct endpoint from working codebase)
      const response = await fetch(`${merlinUrl}/api/v1/caring/get-condition-list`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Merlin API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const conditions = data.conditions || []
      console.log(`📋 Fetched ${conditions.length} conditions from Merlin API`)
      
      // Transform Merlin API response to our format, filtering out invalid entries
      return conditions
        .filter((condition: any) => {
          // Ensure we have a valid name
          const name = condition.name || condition.condition_name || condition.display_name
          return name && name.trim().length > 0
        })
        .map((condition: any, index: number) => {
          const name = condition.name || condition.condition_name || condition.display_name
          return {
            id: condition.id || `condition_${index}_${name.replace(/\s+/g, '_').toLowerCase()}`,
            name: name,
            icd10_code: condition.icd10_code || condition.icd_code || null,
            category: condition.category || condition.condition_category || null,
            description: condition.description || null,
            symptoms: condition.symptoms || condition.common_symptoms || [],
            related_conditions: condition.related_conditions || [],
            severity_levels: condition.severity_levels || condition.severity || [],
            common_treatments: condition.treatments || condition.common_treatments || [],
            risk_factors: condition.risk_factors || []
          }
        })

    } catch (error) {
      console.error('Error fetching conditions from Merlin API:', error)
      throw error
    }
  }

  /**
   * Get JWT token for Merlin API authentication
   */
  private async getJWTToken(): Promise<string> {
    const UMA_API_URL = 'https://uma-394631772515.us-central1.run.app'
    const UMA_API_KEY = process.env.UMA_API_KEY
    
    if (!UMA_API_KEY) {
      throw new Error('UMA_API_KEY environment variable not found')
    }

    try {
      const response = await fetch(`${UMA_API_URL}/get-token`, {
        method: 'GET',
        headers: {
          'Authorization': `basic ${UMA_API_KEY}`,
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })

      if (!response.ok) {
        throw new Error(`JWT authentication failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const token = data.token
      
      if (!token) {
        throw new Error('No JWT token received from UMA API')
      }

      console.log('✅ JWT token obtained for Merlin API access')
      return token

    } catch (error) {
      console.error('Error getting JWT token:', error)
      throw error
    }
  }

  /**
   * Insert a single condition into the database
   */
  private async insertCondition(condition: ConditionEntry): Promise<void> {
    const query = `
      INSERT INTO conditions_master (
        id, name, icd10_code, category, description, 
        symptoms, related_conditions, severity_levels,
        common_treatments, risk_factors
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        icd10_code = EXCLUDED.icd10_code,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        symptoms = EXCLUDED.symptoms,
        related_conditions = EXCLUDED.related_conditions,
        severity_levels = EXCLUDED.severity_levels,
        common_treatments = EXCLUDED.common_treatments,
        risk_factors = EXCLUDED.risk_factors,
        updated_at = CURRENT_TIMESTAMP
    `

    const client = await DatabasePool.getClient()
    try {
      await client.query(query, [
      condition.id,
      condition.name,
      condition.icd10_code || null,
      condition.category || null,
      condition.description || null,
      condition.symptoms || [],
      condition.related_conditions || [],
      condition.severity_levels || [],
      condition.common_treatments || [],
      condition.risk_factors || []
    ])
    } finally {
      client.release()
    }
  }

  /**
   * Search conditions by name or category
   */
  async searchConditions(query: string, limit: number = 50): Promise<ConditionEntry[]> {
    try {
      const searchQuery = `
        SELECT * FROM conditions_master
        WHERE 
          LOWER(name) LIKE LOWER($1) OR
          LOWER(category) LIKE LOWER($1) OR
          LOWER(icd10_code) LIKE LOWER($1)
        ORDER BY 
          CASE 
            WHEN LOWER(name) = LOWER($2) THEN 1
            WHEN LOWER(name) LIKE LOWER($1) THEN 2
            WHEN LOWER(category) LIKE LOWER($1) THEN 3
            ELSE 4
          END,
          name
        LIMIT $3
      `

      const searchTerm = `%${query}%`
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(searchQuery, [searchTerm, query, limit])
      } finally {
        client.release()
      }
      
      return result.rows.map(this.mapRowToCondition)
    } catch (error) {
      console.error('Error searching conditions:', error)
      return []
    }
  }

  /**
   * Get condition by exact ID
   */
  async getConditionById(id: string): Promise<ConditionEntry | null> {
    try {
      const query = 'SELECT * FROM conditions_master WHERE id = $1'
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(query, [id])
      } finally {
        client.release()
      }
      
      if (result.rows.length === 0) return null
      return this.mapRowToCondition(result.rows[0])
    } catch (error) {
      console.error('Error getting condition by ID:', error)
      return null
    }
  }

  /**
   * Get conditions by category
   */
  async getConditionsByCategory(category: string, limit: number = 20): Promise<ConditionEntry[]> {
    try {
      const query = `
        SELECT * FROM conditions_master 
        WHERE category = $1 
        ORDER BY name 
        LIMIT $2
      `
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(query, [category, limit])
      } finally {
        client.release()
      }
      
      return result.rows.map(this.mapRowToCondition)
    } catch (error) {
      console.error('Error getting conditions by category:', error)
      return []
    }
  }

  /**
   * Get total conditions count
   */
  async getConditionsCount(): Promise<number> {
    try {
      const query = 'SELECT COUNT(*) as count FROM conditions_master'
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(query)
      } finally {
        client.release()
      }
      return parseInt(result.rows[0].count)
    } catch (error) {
      console.error('Error getting conditions count:', error)
      return 0
    }
  }

  /**
   * Log sync operation
   */
  private async logSync(count: number, source: string, status: string, errorDetails?: string): Promise<void> {
    try {
      const query = `
        INSERT INTO conditions_sync_log (conditions_count, sync_source, sync_status, error_details)
        VALUES ($1, $2, $3, $4)
      `
      const client = await DatabasePool.getClient()
      try {
        await client.query(query, [count, source, status, errorDetails || null])
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Error logging sync:', error)
    }
  }

  /**
   * Map database row to ConditionEntry
   */
  private mapRowToCondition(row: any): ConditionEntry {
    return {
      id: row.id,
      name: row.name,
      icd10_code: row.icd10_code,
      category: row.category,
      description: row.description,
      symptoms: row.symptoms || [],
      related_conditions: row.related_conditions || [],
      severity_levels: row.severity_levels || [],
      common_treatments: row.common_treatments || [],
      risk_factors: row.risk_factors || [],
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }
}

export const conditionsDatabase = new ConditionsDatabase()