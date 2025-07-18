import { Pool } from 'pg'
import OpenAI from 'openai'

/**
 * Neon Vector Memory System - Leverages Neon's pgvector extension for semantic search
 * and intelligent memory retrieval using vector embeddings
 */

export interface VectorMemoryEntry {
  id?: string
  userId: string
  sessionId: string
  content: string
  embedding: number[]
  memoryType: string
  metadata: {
    summary: string
    details: any
    confidence: number
    importance: number
    relatedSymptoms: string[]
    tags: string[]
    extractedAt: Date
  }
  similarity?: number
}

export interface SemanticSearchResult {
  entry: VectorMemoryEntry
  similarity: number
  relevanceScore: number
}

class NeonVectorMemory {
  private pool: Pool
  private openai: OpenAI

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    })
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  /**
   * Initialize vector memory schema with pgvector extension
   */
  async initializeVectorSchema(): Promise<void> {
    const client = await this.pool.connect()
    
    try {
      await client.query('BEGIN')

      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector')

      // Create vector memory table
      await client.query(`
        CREATE TABLE IF NOT EXISTS vector_memory (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_id VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          embedding vector(1536), -- OpenAI ada-002 embedding dimension
          memory_type VARCHAR(50) NOT NULL,
          metadata JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create vector similarity index using HNSW
      await client.query(`
        CREATE INDEX IF NOT EXISTS vector_memory_embedding_idx 
        ON vector_memory USING hnsw (embedding vector_cosine_ops)
      `)

      // Create GIN index for metadata search
      await client.query(`
        CREATE INDEX IF NOT EXISTS vector_memory_metadata_idx 
        ON vector_memory USING gin (metadata)
      `)

      // Create regular indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS vector_memory_user_type_idx 
        ON vector_memory(user_id, memory_type);
        
        CREATE INDEX IF NOT EXISTS vector_memory_session_idx 
        ON vector_memory(session_id);
        
        CREATE INDEX IF NOT EXISTS vector_memory_created_idx 
        ON vector_memory(user_id, created_at DESC);
      `)

      // Create full-text search index for content
      await client.query(`
        ALTER TABLE vector_memory 
        ADD COLUMN IF NOT EXISTS content_tsvector tsvector 
        GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS vector_memory_fts_idx 
        ON vector_memory USING gin (content_tsvector)
      `)

      await client.query('COMMIT')
      console.log('✅ Neon vector memory schema initialized successfully')
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('❌ Error initializing vector memory schema:', error)
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Generate embedding for text content
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.replace(/\n/g, ' ').trim()
      })
      
      return response.data[0].embedding
    } catch (error) {
      console.error('❌ Error generating embedding:', error)
      throw error
    }
  }

  /**
   * Store memory with vector embedding
   */
  async storeVectorMemory(entry: VectorMemoryEntry): Promise<string> {
    const client = await this.pool.connect()
    
    try {
      // Generate embedding if not provided
      let embedding = entry.embedding
      if (!embedding || embedding.length === 0) {
        embedding = await this.generateEmbedding(entry.content)
      }

      // Check for similar existing memories to avoid duplicates
      const similarMemories = await this.findSimilarMemories(
        entry.userId, 
        entry.content, 
        0.95, // Very high threshold for duplicates
        1
      )

      if (similarMemories.length > 0) {
        // Update existing memory instead of creating duplicate
        const existingId = similarMemories[0].entry.id
        await client.query(`
          UPDATE vector_memory 
          SET content = $1, embedding = $2, metadata = $3, updated_at = CURRENT_TIMESTAMP
          WHERE id = $4 AND user_id = $5
        `, [
          entry.content,
          `[${embedding.join(',')}]`,
          JSON.stringify(entry.metadata),
          existingId,
          entry.userId
        ])
        
        return existingId!
      }

      // Insert new memory
      const result = await client.query(`
        INSERT INTO vector_memory (
          user_id, session_id, content, embedding, memory_type, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        entry.userId,
        entry.sessionId,
        entry.content,
        `[${embedding.join(',')}]`,
        entry.memoryType,
        JSON.stringify(entry.metadata)
      ])

      return result.rows[0].id
    } catch (error) {
      console.error('❌ Error storing vector memory:', error)
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Semantic search using vector similarity
   */
  async semanticSearch(
    userId: string, 
    query: string, 
    limit: number = 10,
    similarityThreshold: number = 0.7,
    memoryTypes?: string[]
  ): Promise<SemanticSearchResult[]> {
    const client = await this.pool.connect()
    
    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query)
      
      // Build type filter
      let typeFilter = ''
      let params: any[] = [userId, `[${queryEmbedding.join(',')}]`, similarityThreshold, limit]
      
      if (memoryTypes && memoryTypes.length > 0) {
        typeFilter = `AND memory_type = ANY($${params.length + 1})`
        params.push(memoryTypes)
      }

      // Semantic search query with cosine similarity
      const result = await client.query(`
        SELECT 
          id,
          user_id as "userId",
          session_id as "sessionId",
          content,
          embedding,
          memory_type as "memoryType",
          metadata,
          created_at as "createdAt",
          1 - (embedding <=> $2::vector) as similarity
        FROM vector_memory 
        WHERE user_id = $1 
          AND 1 - (embedding <=> $2::vector) > $3
          ${typeFilter}
        ORDER BY embedding <=> $2::vector
        LIMIT $4
      `, params)

      const results: SemanticSearchResult[] = result.rows.map(row => {
        const metadata = typeof row.metadata === 'string' 
          ? JSON.parse(row.metadata) 
          : row.metadata

        return {
          entry: {
            id: row.id,
            userId: row.userId,
            sessionId: row.sessionId,
            content: row.content,
            embedding: [], // Don't return large embedding arrays
            memoryType: row.memoryType,
            metadata,
            similarity: row.similarity
          },
          similarity: row.similarity,
          relevanceScore: this.calculateRelevanceScore(row.similarity, metadata)
        }
      })

      return results.sort((a, b) => b.relevanceScore - a.relevanceScore)
    } catch (error) {
      console.error('❌ Error in semantic search:', error)
      return []
    } finally {
      client.release()
    }
  }

  /**
   * Hybrid search combining vector similarity and full-text search
   */
  async hybridSearch(
    userId: string, 
    query: string, 
    limit: number = 10
  ): Promise<SemanticSearchResult[]> {
    const client = await this.pool.connect()
    
    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query)
      
      // Hybrid search combining vector similarity and text search
      const result = await client.query(`
        WITH vector_search AS (
          SELECT 
            id, user_id, session_id, content, memory_type, metadata, created_at,
            1 - (embedding <=> $2::vector) as vector_similarity,
            'vector' as search_type
          FROM vector_memory 
          WHERE user_id = $1 
            AND 1 - (embedding <=> $2::vector) > 0.6
          ORDER BY embedding <=> $2::vector
          LIMIT $3
        ),
        text_search AS (
          SELECT 
            id, user_id, session_id, content, memory_type, metadata, created_at,
            ts_rank(content_tsvector, plainto_tsquery('english', $4)) as text_rank,
            'text' as search_type
          FROM vector_memory 
          WHERE user_id = $1 
            AND content_tsvector @@ plainto_tsquery('english', $4)
          ORDER BY ts_rank(content_tsvector, plainto_tsquery('english', $4)) DESC
          LIMIT $3
        )
        SELECT DISTINCT ON (id)
          id,
          user_id as "userId",
          session_id as "sessionId", 
          content,
          memory_type as "memoryType",
          metadata,
          created_at as "createdAt",
          COALESCE(vector_similarity, 0) as vector_sim,
          COALESCE(text_rank, 0) as text_sim,
          search_type
        FROM (
          SELECT * FROM vector_search
          UNION ALL
          SELECT id, user_id, session_id, content, memory_type, metadata, created_at, 0, search_type FROM text_search
        ) combined
        ORDER BY id, (COALESCE(vector_similarity, 0) + COALESCE(text_rank, 0)) DESC
        LIMIT $3
      `, [userId, `[${queryEmbedding.join(',')}]`, limit, query])

      const results: SemanticSearchResult[] = result.rows.map(row => {
        const metadata = typeof row.metadata === 'string' 
          ? JSON.parse(row.metadata) 
          : row.metadata

        const combinedScore = row.vector_sim + (row.text_sim * 0.3) // Weight vector similarity higher
        
        return {
          entry: {
            id: row.id,
            userId: row.userId,
            sessionId: row.sessionId,
            content: row.content,
            embedding: [],
            memoryType: row.memoryType,
            metadata
          },
          similarity: row.vector_sim,
          relevanceScore: this.calculateRelevanceScore(combinedScore, metadata)
        }
      })

      return results.sort((a, b) => b.relevanceScore - a.relevanceScore)
    } catch (error) {
      console.error('❌ Error in hybrid search:', error)
      return []
    } finally {
      client.release()
    }
  }

  /**
   * Find similar memories to avoid duplicates
   */
  private async findSimilarMemories(
    userId: string, 
    content: string, 
    threshold: number = 0.9,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    return this.semanticSearch(userId, content, limit, threshold)
  }

  /**
   * Calculate relevance score based on similarity and metadata
   */
  private calculateRelevanceScore(similarity: number, metadata: any): number {
    let score = similarity * 0.7 // Base similarity weight

    // Boost for importance
    if (metadata.importance) {
      score += metadata.importance * 0.2
    }

    // Boost for confidence
    if (metadata.confidence) {
      score += metadata.confidence * 0.1
    }

    // Recency boost (newer memories slightly favored)
    if (metadata.extractedAt) {
      const daysSinceExtracted = (Date.now() - new Date(metadata.extractedAt).getTime()) / (1000 * 60 * 60 * 24)
      const recencyBonus = Math.max(0, (30 - daysSinceExtracted) / 30) * 0.05
      score += recencyBonus
    }

    return Math.min(1.0, score)
  }

  /**
   * Get contextual memories for a query
   */
  async getContextualMemories(
    userId: string, 
    query: string, 
    currentSymptoms: string[] = [],
    limit: number = 5
  ): Promise<string> {
    try {
      // Expand query with current symptoms
      const expandedQuery = [query, ...currentSymptoms].join(' ')
      
      // Get relevant memories using hybrid search
      const memories = await this.hybridSearch(userId, expandedQuery, limit)
      
      if (memories.length === 0) {
        return ''
      }

      // Group memories by type
      const groupedMemories: Record<string, SemanticSearchResult[]> = {}
      memories.forEach(memory => {
        const type = memory.entry.memoryType
        if (!groupedMemories[type]) {
          groupedMemories[type] = []
        }
        groupedMemories[type].push(memory)
      })

      // Format context string
      let context = '**Previous Session Context:**\n\n'
      
      for (const [type, typeMemories] of Object.entries(groupedMemories)) {
        const typeLabel = type.replace('_', ' ').toUpperCase()
        context += `**${typeLabel}:**\n`
        
        typeMemories.slice(0, 3).forEach(memory => {
          const relevancePercent = Math.round(memory.relevanceScore * 100)
          context += `• ${memory.entry.metadata.summary} (${relevancePercent}% relevant)\n`
        })
        
        context += '\n'
      }

      return context.trim()
    } catch (error) {
      console.error('❌ Error getting contextual memories:', error)
      return ''
    }
  }

  /**
   * Batch process memories from conversation chunks
   */
  async batchStoreMemories(
    userId: string,
    sessionId: string,
    memoryEntries: any[]
  ): Promise<number> {
    let storedCount = 0
    
    for (const entry of memoryEntries) {
      try {
        const vectorEntry: VectorMemoryEntry = {
          userId,
          sessionId,
          content: `${entry.summary} ${JSON.stringify(entry.details)}`,
          embedding: [], // Will be generated in storeVectorMemory
          memoryType: entry.type,
          metadata: {
            summary: entry.summary,
            details: entry.details,
            confidence: entry.confidence,
            importance: entry.importance,
            relatedSymptoms: entry.symptoms || [],
            tags: entry.tags || [],
            extractedAt: new Date()
          }
        }
        
        await this.storeVectorMemory(vectorEntry)
        storedCount++
      } catch (error) {
        console.error('❌ Error storing memory entry:', error)
      }
    }
    
    return storedCount
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(userId: string): Promise<{
    totalMemories: number
    memoryTypes: Record<string, number>
    averageImportance: number
    recentMemories: number
  }> {
    const client = await this.pool.connect()
    
    try {
      const stats = await client.query(`
        SELECT 
          COUNT(*) as total_memories,
          AVG((metadata->>'importance')::float) as avg_importance,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as recent_memories
        FROM vector_memory 
        WHERE user_id = $1
      `, [userId])

      const typeStats = await client.query(`
        SELECT memory_type, COUNT(*) as count
        FROM vector_memory 
        WHERE user_id = $1
        GROUP BY memory_type
      `, [userId])

      const memoryTypes: Record<string, number> = {}
      typeStats.rows.forEach(row => {
        memoryTypes[row.memory_type] = parseInt(row.count)
      })

      return {
        totalMemories: parseInt(stats.rows[0]?.total_memories || '0'),
        memoryTypes,
        averageImportance: parseFloat(stats.rows[0]?.avg_importance || '0'),
        recentMemories: parseInt(stats.rows[0]?.recent_memories || '0')
      }
    } catch (error) {
      console.error('❌ Error getting memory stats:', error)
      return {
        totalMemories: 0,
        memoryTypes: {},
        averageImportance: 0,
        recentMemories: 0
      }
    } finally {
      client.release()
    }
  }
}

// Export singleton instance
export const neonVectorMemory = new NeonVectorMemory()