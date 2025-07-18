import { Pool } from 'pg'
import { OpenAI } from 'openai'

export interface EnhancedSDCODocument {
  id: string
  sdco_id: string
  medical_term: string
  layman_term: string
  category: string
  enhanced_content: string
  embedding: number[]
  synonyms: string[]
  related_terms: string[]
  severity_level: string
  body_system: string
  last_updated: Date
}

export interface SearchResult {
  document: EnhancedSDCODocument
  similarity: number
  relevance_score: number
}

export class EnhancedVectorSearch {
  private pool: Pool
  private openai: OpenAI

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    })
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }

  async initializeEnhancedSDCOStorage(): Promise<void> {
    await this.pool.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
      
      CREATE TABLE IF NOT EXISTS enhanced_sdco_documents (
        id SERIAL PRIMARY KEY,
        sdco_id VARCHAR(255) UNIQUE NOT NULL,
        medical_term VARCHAR(500) NOT NULL,
        layman_term VARCHAR(500),
        category VARCHAR(200),
        enhanced_content TEXT,
        embedding vector(1536),
        synonyms TEXT[],
        related_terms TEXT[],
        severity_level VARCHAR(50),
        body_system VARCHAR(200),
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_enhanced_sdco_embedding 
      ON enhanced_sdco_documents USING hnsw (embedding vector_cosine_ops);
      
      CREATE INDEX IF NOT EXISTS idx_enhanced_sdco_category 
      ON enhanced_sdco_documents(category);
      
      CREATE INDEX IF NOT EXISTS idx_enhanced_sdco_body_system 
      ON enhanced_sdco_documents(body_system);
    `)
  }

  async populateEnhancedSDCODocuments(jwtToken: string): Promise<void> {
    try {
      // Fetch SDCO data (placeholder implementation)
      const sdcoData = await this.fetchSDCOData(jwtToken)
      
      for (const sdco of sdcoData) {
        const enhancedContent = await this.generateEnhancedContent(sdco)
        const embedding = await this.generateEmbedding(enhancedContent)
        
        await this.storeEnhancedDocument({
          sdco_id: sdco.id,
          medical_term: sdco.medical_term,
          layman_term: sdco.layman_term,
          category: sdco.category,
          enhanced_content: enhancedContent,
          embedding,
          synonyms: sdco.synonyms || [],
          related_terms: sdco.related_terms || [],
          severity_level: sdco.severity_level || 'unknown',
          body_system: sdco.body_system || 'general'
        })
      }
    } catch (error) {
      console.error('Error populating enhanced SDCO documents:', error)
      throw error
    }
  }

  private async fetchSDCOData(jwtToken: string): Promise<any[]> {
    // Placeholder - would fetch from actual GLM API
    return []
  }

  async searchSDCODocuments(
    query: string,
    limit: number = 5,
    body_system?: string,
    content_types?: string[]
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.generateEmbedding(query)
      
      let whereClause = ''
      const params: any[] = [queryEmbedding, limit]
      
      if (body_system) {
        whereClause += ' AND body_system = $' + (params.length + 1)
        params.push(body_system)
      }
      
      const searchQuery = `
        SELECT *, embedding <=> $1 as distance
        FROM enhanced_sdco_documents
        WHERE 1=1 ${whereClause}
        ORDER BY embedding <=> $1
        LIMIT $2
      `
      
      const result = await this.pool.query(searchQuery, params)
      
      return result.rows.map(row => ({
        document: {
          id: row.id,
          sdco_id: row.sdco_id,
          medical_term: row.medical_term,
          layman_term: row.layman_term,
          category: row.category,
          enhanced_content: row.enhanced_content,
          embedding: row.embedding,
          synonyms: row.synonyms || [],
          related_terms: row.related_terms || [],
          severity_level: row.severity_level,
          body_system: row.body_system,
          last_updated: row.last_updated
        },
        similarity: 1 - row.distance,
        relevance_score: this.calculateRelevanceScore(1 - row.distance, row)
      }))
    } catch (error) {
      console.error('Error in searchSDCODocuments:', error)
      return []
    }
  }

  async getContextualSDCOInformation(
    query: string,
    sdco_id?: string,
    maxTokens: number = 2000
  ): Promise<string> {
    try {
      const searchResults = await this.searchSDCODocuments(query, 5)
      
      if (searchResults.length === 0) {
        return 'No relevant medical information found.'
      }
      
      let contextInfo = `Relevant medical information for "${query}":\n\n`
      let tokenCount = 0
      
      for (const result of searchResults) {
        const doc = result.document
        const snippet = `${doc.medical_term} (${doc.layman_term}): ${doc.enhanced_content || doc.category}\n`
        
        if (tokenCount + snippet.length > maxTokens) break
        
        contextInfo += snippet
        tokenCount += snippet.length
      }
      
      return contextInfo
    } catch (error) {
      console.error('Error in getContextualSDCOInformation:', error)
      return 'Error retrieving medical context information.'
    }
  }

  private calculateRelevanceScore(similarity: number, row: any): number {
    // Base relevance on similarity score with some adjustments
    let score = similarity
    
    // Boost score for more severe conditions
    if (row.severity_level === 'high') score *= 1.2
    else if (row.severity_level === 'critical') score *= 1.3
    
    return Math.min(score, 1.0)
  }

  private async generateEnhancedContent(sdco: any): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'system',
          content: 'Generate enhanced medical content for symptom classification.'
        }, {
          role: 'user',
          content: `Create enhanced content for: ${sdco.medical_term}`
        }],
        max_tokens: 500
      })

      return response.choices[0]?.message?.content || ''
    } catch (error) {
      console.error('Error generating enhanced content:', error)
      return ''
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      })

      return response.data[0].embedding
    } catch (error) {
      console.error('Error generating embedding:', error)
      return []
    }
  }

  private async storeEnhancedDocument(doc: Omit<EnhancedSDCODocument, 'id' | 'last_updated'>): Promise<void> {
    await this.pool.query(`
      INSERT INTO enhanced_sdco_documents 
      (sdco_id, medical_term, layman_term, category, enhanced_content, embedding, synonyms, related_terms, severity_level, body_system)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (sdco_id) DO UPDATE SET
        medical_term = EXCLUDED.medical_term,
        layman_term = EXCLUDED.layman_term,
        enhanced_content = EXCLUDED.enhanced_content,
        embedding = EXCLUDED.embedding,
        last_updated = CURRENT_TIMESTAMP
    `, [
      doc.sdco_id,
      doc.medical_term,
      doc.layman_term,
      doc.category,
      doc.enhanced_content,
      JSON.stringify(doc.embedding),
      doc.synonyms,
      doc.related_terms,
      doc.severity_level,
      doc.body_system
    ])
  }

  async semanticSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.generateEmbedding(query)
      
      const result = await this.pool.query(`
        SELECT *, (embedding <=> $1::vector) as distance
        FROM enhanced_sdco_documents
        ORDER BY distance
        LIMIT $2
      `, [JSON.stringify(queryEmbedding), limit])

      return result.rows.map(row => ({
        document: {
          id: row.id,
          sdco_id: row.sdco_id,
          medical_term: row.medical_term,
          layman_term: row.layman_term,
          category: row.category,
          enhanced_content: row.enhanced_content,
          embedding: row.embedding,
          synonyms: row.synonyms,
          related_terms: row.related_terms,
          severity_level: row.severity_level,
          body_system: row.body_system,
          last_updated: row.last_updated
        },
        similarity: 1 - row.distance,
        relevance_score: (1 - row.distance) * 100
      }))
    } catch (error) {
      console.error('Error performing semantic search:', error)
      return []
    }
  }
}