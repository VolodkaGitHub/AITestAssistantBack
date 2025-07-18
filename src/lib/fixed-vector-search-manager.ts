/**
 * Fixed Vector Search Manager - Uses sdco_documents table with 942 documents
 */

import { DatabasePool } from './database-pool';

export interface VectorSearchStatus {
  exists: boolean
  documentCount: number
  isReady: boolean
}

export class FixedVectorSearchManager {
  private dbPool: DatabasePool

  constructor(databaseUrl?: string) {
    this.dbPool = DatabasePool.getInstance()
  }

  /**
   * Check if vector search database is ready with 942 documents
   */
  async isDatabaseReady(): Promise<VectorSearchStatus> {
    const client = await DatabasePool.getClient()
    
    try {
      // Check if sdco_documents table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'sdco_documents'
        )
      `)
      
      if (!tableCheck.rows[0].exists) {
        return { exists: false, documentCount: 0, isReady: false }
      }

      // Check document count
      const countResult = await client.query('SELECT COUNT(*) FROM sdco_documents')
      const documentCount = parseInt(countResult.rows[0].count)
      
      return { 
        exists: true, 
        documentCount,
        isReady: documentCount > 900 // Should have close to 942 documents
      }
    } catch (error) {
      console.error('Error checking database readiness:', error)
      return { exists: false, documentCount: 0, isReady: false }
    } finally {
      client.release()
    }
  }

  /**
   * Search through all 942 SDCO documents for throat-related symptoms
   */
  async searchSymptoms(symptom: string, limit: number = 10): Promise<any[]> {
    const client = await DatabasePool.getClient()
    
    try {
      console.log(`Searching ${symptom} across 942 SDCO documents...`)

      // Search across all text fields in sdco_documents table
      const searchQuery = `
        SELECT 
          sdco_id,
          medical_term,
          layman_term,
          description,
          definition,
          definition_layman,
          category,
          combined_text,
          CASE 
            WHEN LOWER(medical_term) ILIKE $1 THEN 1.0
            WHEN LOWER(layman_term) ILIKE $1 THEN 0.9
            WHEN LOWER(definition_layman) ILIKE $1 THEN 0.8
            WHEN LOWER(description) ILIKE $1 THEN 0.7
            WHEN LOWER(combined_text) ILIKE $1 THEN 0.5
            ELSE 0.3
          END as relevance_score
        FROM sdco_documents
        WHERE 
          LOWER(medical_term) ILIKE $1
          OR LOWER(layman_term) ILIKE $1
          OR LOWER(description) ILIKE $1
          OR LOWER(definition_layman) ILIKE $1
          OR LOWER(combined_text) ILIKE $1
        ORDER BY relevance_score DESC, medical_term
        LIMIT $2
      `

      const searchPattern = `%${symptom.toLowerCase()}%`
      const result = await client.query(searchQuery, [searchPattern, limit])

      console.log(`Found ${result.rows.length} matches for "${symptom}"`)
      
      return result.rows.map(row => ({
        sdco_id: row.sdco_id,
        display_name: row.medical_term,
        display_name_layman: row.layman_term,
        relevance_score: parseFloat(row.relevance_score || 0),
        matched_content: row.combined_text,
        body_system: row.category,
        definition: row.definition,
        definition_layman: row.definition_layman
      }))

    } catch (error) {
      console.error('Error searching SDCO documents:', error)
      return []
    } finally {
      client.release()
    }
  }

  /**
   * Test search specifically for throat symptoms
   */
  async testThroatSearch(): Promise<void> {
    console.log('Testing throat symptom searches across 942 documents...')
    
    const testSymptoms = [
      'back throat is itchy',
      'itchy throat', 
      'throat pain',
      'sore throat',
      'scratchy throat',
      'pharyngitis'
    ]

    for (const symptom of testSymptoms) {
      const results = await this.searchSymptoms(symptom, 5)
      console.log(`\n"${symptom}" found ${results.length} matches:`)
      
      results.forEach(result => {
        console.log(`  - ${result.sdco_id}: ${result.display_name} (score: ${result.relevance_score})`)
      })
    }
  }

  /**
   * Ensure vector search is ready - uses existing 942 document table
   */
  async ensureVectorSearchReady(): Promise<boolean> {
    try {
      const status = await this.isDatabaseReady()
      
      if (!status.exists) {
        console.error('sdco_documents table does not exist')
        return false
      }

      if (status.documentCount < 900) {
        console.error(`Only ${status.documentCount} documents found, expected ~942`)
        return false
      }

      console.log(`Vector search ready with ${status.documentCount} SDCO documents`)
      return true

    } catch (error) {
      console.error('Error ensuring vector search readiness:', error)
      return false
    }
  }
}