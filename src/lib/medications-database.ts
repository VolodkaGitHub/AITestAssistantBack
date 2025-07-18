/**
 * Static Medications Database
 * Populated once from Merlin API, then used for user selections and scanning
 */

import { DatabasePool } from './database-pool';

export interface MedicationEntry {
  id: string
  name: string
  generic_name?: string
  brand_names?: string[]
  description?: string
  dosage_forms?: string[]
  common_dosages?: string[]
  therapeutic_class?: string
  indications?: string[]
  warnings?: string[]
  side_effects?: string[]
  created_at?: string
  updated_at?: string
}

class MedicationsDatabase {

  /**
   * Initialize medications database schema
   */
  async initializeSchema(): Promise<void> {
    // Using DatabasePool.getClient() directly
    const query = `
      CREATE TABLE IF NOT EXISTS medications_master (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        brand_names TEXT[], -- Array of brand names
        description TEXT,
        dosage_forms TEXT[], -- Array of available forms (tablet, capsule, liquid, etc.)
        common_dosages TEXT[], -- Array of common dosage strengths
        therapeutic_class VARCHAR(255),
        indications TEXT[], -- Array of what it treats
        warnings TEXT[], -- Array of important warnings
        side_effects TEXT[], -- Array of common side effects
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for fast searching
      CREATE INDEX IF NOT EXISTS idx_medications_name ON medications_master(name);
      CREATE INDEX IF NOT EXISTS idx_medications_generic ON medications_master(generic_name);
      CREATE INDEX IF NOT EXISTS idx_medications_class ON medications_master(therapeutic_class);

      -- Track last population time
      CREATE TABLE IF NOT EXISTS medications_sync_log (
        id SERIAL PRIMARY KEY,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        medications_count INTEGER,
        sync_source VARCHAR(100),
        sync_status VARCHAR(50)
      );
    `
    
    const client = await DatabasePool.getClient()
    try {
      await client.query(query)
    } finally {
      client.release()
    }
    console.log('✅ Medications master database schema initialized')
  }

  /**
   * Check if medications database needs population
   */
  async needsPopulation(): Promise<boolean> {
    try {
      const countQuery = 'SELECT COUNT(*) as count FROM medications_master'
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(countQuery)
      } finally {
        client.release()
      }
      const count = parseInt(result.rows[0].count)
      
      // Consider populated if we have at least 1 medication (database has been initialized)
      return count < 1
    } catch (error) {
      console.error('Error checking medications count:', error)
      return true
    }
  }

  /**
   * Populate medications database from Merlin API (full population)
   */
  async populateFromMerlin(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      console.log('🏥 Starting full medications population from Merlin API...')
      
      // Check if already populated
      const needsPop = await this.needsPopulation()
      if (!needsPop) {
        const count = await this.getMedicationsCount()
        console.log(`📋 Medications database already populated with ${count} entries`)
        return { success: true, count }
      }

      // Fetch all medications from Merlin API
      const merlinMedications = await this.fetchAllMedicationsFromMerlin()
      
      let insertedCount = 0
      for (const med of merlinMedications) {
        try {
          await this.insertMedication(med)
          insertedCount++
        } catch (error) {
          console.error(`Error inserting medication ${med.name}:`, error)
        }
      }

      // Log the sync
      await this.logSync(insertedCount, 'merlin_api', 'success')
      
      console.log(`✅ Populated medications database with ${insertedCount} medications from Merlin API`)
      return { success: true, count: insertedCount }

    } catch (error) {
      console.error('Error populating medications from Merlin:', error)
      await this.logSync(0, 'merlin_api', 'failed')
      return { 
        success: false, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Fetch all medications from Merlin API using JWT authentication
   */
  private async fetchAllMedicationsFromMerlin(): Promise<MedicationEntry[]> {
    console.log('📡 Fetching all medications from Merlin API...')
    
    try {
      // Get JWT token first
      const jwtToken = await this.getJWTToken()
      
      // Use correct Merlin endpoint
      const merlinUrl = 'https://merlin-394631772515.us-central1.run.app'
      
      // Fetch medications from Merlin medication catalog
      const response = await fetch(`${merlinUrl}/api/v1/medication/get-medication-catalog`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Merlin API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      console.log(`📋 Fetched ${data?.length || 0} medications from Merlin API`)
      
      // Transform Merlin API response to our format
      return (data || []).map((medication: any, index: number) => ({
        id: medication.id || `med_${index}_${medication.name?.replace(/\s+/g, '_').toLowerCase()}`,
        name: medication.name || medication.medication_name,
        generic_name: medication.generic_name,
        brand_names: medication.brand_names || (medication.brand_name ? [medication.brand_name] : []),
        description: medication.description,
        dosage_forms: medication.dosage_forms || [],
        common_dosages: medication.dosages || medication.common_dosages || [],
        therapeutic_class: medication.therapeutic_class || medication.class,
        indications: medication.indications || [],
        warnings: medication.warnings || [],
        side_effects: medication.side_effects || medication.adverse_effects || []
      }))

    } catch (error) {
      console.error('Error fetching medications from Merlin API:', error)
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
   * Insert a single medication into the database
   */
  private async insertMedication(medication: MedicationEntry): Promise<void> {
    const query = `
      INSERT INTO medications_master (
        id, name, generic_name, brand_names, description, 
        dosage_forms, common_dosages, therapeutic_class,
        indications, warnings, side_effects
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        generic_name = EXCLUDED.generic_name,
        brand_names = EXCLUDED.brand_names,
        description = EXCLUDED.description,
        dosage_forms = EXCLUDED.dosage_forms,
        common_dosages = EXCLUDED.common_dosages,
        therapeutic_class = EXCLUDED.therapeutic_class,
        indications = EXCLUDED.indications,
        warnings = EXCLUDED.warnings,
        side_effects = EXCLUDED.side_effects,
        updated_at = CURRENT_TIMESTAMP
    `

    const client = await DatabasePool.getClient()
    try {
      await client.query(query, [
      medication.id,
      medication.name,
      medication.generic_name || null,
      medication.brand_names || [],
      medication.description || null,
      medication.dosage_forms || [],
      medication.common_dosages || [],
      medication.therapeutic_class || null,
      medication.indications || [],
      medication.warnings || [],
        medication.side_effects || []
      ])
    } finally {
      client.release()
    }
  }

  /**
   * Search medications by name, generic name, or brand names
   */
  async searchMedications(query: string, limit: number = 50): Promise<MedicationEntry[]> {
    try {
      const searchQuery = `
        SELECT * FROM medications_master
        WHERE 
          LOWER(name) LIKE LOWER($1) OR
          LOWER(generic_name) LIKE LOWER($1) OR
          EXISTS (
            SELECT 1 FROM unnest(brand_names) AS brand
            WHERE LOWER(brand) LIKE LOWER($1)
          )
        ORDER BY 
          CASE 
            WHEN LOWER(name) = LOWER($2) THEN 1
            WHEN LOWER(name) LIKE LOWER($1) THEN 2
            WHEN LOWER(generic_name) LIKE LOWER($1) THEN 3
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
      
      return result.rows.map(this.mapRowToMedication)
    } catch (error) {
      console.error('Error searching medications:', error)
      return []
    }
  }

  /**
   * Get medication by exact ID
   */
  async getMedicationById(id: string): Promise<MedicationEntry | null> {
    try {
      const query = 'SELECT * FROM medications_master WHERE id = $1'
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(query, [id])
      } finally {
        client.release()
      }
      
      if (result.rows.length === 0) return null
      return this.mapRowToMedication(result.rows[0])
    } catch (error) {
      console.error('Error getting medication by ID:', error)
      return null
    }
  }

  /**
   * Get medications by therapeutic class
   */
  async getMedicationsByClass(therapeuticClass: string, limit: number = 20): Promise<MedicationEntry[]> {
    try {
      const query = `
        SELECT * FROM medications_master 
        WHERE therapeutic_class = $1 
        ORDER BY name 
        LIMIT $2
      `
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(query, [therapeuticClass, limit])
      } finally {
        client.release()
      }
      
      return result.rows.map(this.mapRowToMedication)
    } catch (error) {
      console.error('Error getting medications by class:', error)
      return []
    }
  }

  /**
   * Get total medications count
   */
  async getMedicationsCount(): Promise<number> {
    try {
      const query = 'SELECT COUNT(*) as count FROM medications_master'
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(query)
      } finally {
        client.release()
      }
      return parseInt(result.rows[0].count)
    } catch (error) {
      console.error('Error getting medications count:', error)
      return 0
    }
  }

  /**
   * Log sync operation
   */
  private async logSync(count: number, source: string, status: string): Promise<void> {
    try {
      const query = `
        INSERT INTO medications_sync_log (medications_count, sync_source, sync_status)
        VALUES ($1, $2, $3)
      `
      const client = await DatabasePool.getClient()
      try {
        await client.query(query, [count, source, status])
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Error logging sync:', error)
    }
  }

  /**
   * Map database row to MedicationEntry
   */
  private mapRowToMedication(row: any): MedicationEntry {
    return {
      id: row.id,
      name: row.name,
      generic_name: row.generic_name,
      brand_names: row.brand_names || [],
      description: row.description,
      dosage_forms: row.dosage_forms || [],
      common_dosages: row.common_dosages || [],
      therapeutic_class: row.therapeutic_class,
      indications: row.indications || [],
      warnings: row.warnings || [],
      side_effects: row.side_effects || [],
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }

  /**
   * Get common medications data structure (placeholder for Merlin API)
   */
  private async getCommonMedicationsData(): Promise<MedicationEntry[]> {
    // This would be replaced with actual Merlin API call
    return [
      {
        id: 'med_001',
        name: 'Acetaminophen',
        generic_name: 'acetaminophen',
        brand_names: ['Tylenol', 'Panadol', 'Excedrin'],
        description: 'Pain reliever and fever reducer',
        dosage_forms: ['tablet', 'capsule', 'liquid', 'suppository'],
        common_dosages: ['325mg', '500mg', '650mg'],
        therapeutic_class: 'Analgesic',
        indications: ['Pain relief', 'Fever reduction'],
        warnings: ['Do not exceed 4000mg per day', 'Liver damage risk with alcohol'],
        side_effects: ['Nausea', 'Stomach upset']
      },
      {
        id: 'med_002',
        name: 'Ibuprofen',
        generic_name: 'ibuprofen',
        brand_names: ['Advil', 'Motrin', 'Nuprin'],
        description: 'Nonsteroidal anti-inflammatory drug (NSAID)',
        dosage_forms: ['tablet', 'capsule', 'liquid', 'topical gel'],
        common_dosages: ['200mg', '400mg', '600mg', '800mg'],
        therapeutic_class: 'NSAID',
        indications: ['Pain relief', 'Inflammation reduction', 'Fever reduction'],
        warnings: ['Take with food', 'May increase cardiovascular risk'],
        side_effects: ['Stomach upset', 'Heartburn', 'Dizziness']
      },
      {
        id: 'med_003',
        name: 'Lisinopril',
        generic_name: 'lisinopril',
        brand_names: ['Prinivil', 'Zestril'],
        description: 'ACE inhibitor for blood pressure',
        dosage_forms: ['tablet'],
        common_dosages: ['5mg', '10mg', '20mg', '40mg'],
        therapeutic_class: 'ACE Inhibitor',
        indications: ['High blood pressure', 'Heart failure'],
        warnings: ['Monitor potassium levels', 'Avoid in pregnancy'],
        side_effects: ['Dry cough', 'Dizziness', 'Headache']
      }
      // Add more common medications...
    ]
  }
}

export const medicationsDatabase = new MedicationsDatabase()