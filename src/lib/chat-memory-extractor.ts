import { Pool } from 'pg'
import OpenAI from 'openai'
import { conversationChunker, ConversationChunk } from './conversation-chunker'
import { neonVectorMemory } from './neon-vector-memory'

/**
 * Chat Memory Extractor - Automatically extracts important details from chat history
 * Uses AI to identify and store key medical information, symptoms, medications, 
 * lifestyle factors, and user preferences for future sessions
 */

export interface ChatMemoryEntry {
  id?: string
  userId: string
  sessionId: string
  extractedAt: Date
  memoryType: 'symptom' | 'medication' | 'lifestyle' | 'preference' | 'medical_history' | 'concern' | 'follow_up'
  summary: string
  details: any
  confidence: number
  importance: number
  relatedSymptoms: string[]
  tags: string[]
  sourceMessages: string[]
}

export interface ChatContext {
  previousSymptoms: string[]
  currentMedications: string[]
  chronicConditions: string[]
  lifestyleFactors: Record<string, string>
  userPreferences: Record<string, any>
  previousConcerns: string[]
  followUpNeeded: string[]
  medicalHistory: string[]
}

class ChatMemoryExtractor {
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
   * Initialize chat memory database schema
   */
  async initializeSchema(): Promise<void> {
    const client = await this.pool.connect()
    
    try {
      await client.query('BEGIN')

      // Create chat_memory table
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_memory (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_id VARCHAR(255) NOT NULL,
          extracted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          memory_type VARCHAR(50) NOT NULL,
          summary TEXT NOT NULL,
          details JSONB NOT NULL,
          confidence DECIMAL(3,2) DEFAULT 0.8,
          importance DECIMAL(3,2) DEFAULT 0.5,
          related_symptoms TEXT[] DEFAULT '{}',
          tags TEXT[] DEFAULT '{}',
          source_messages TEXT[] DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create user_chat_context table for quick context retrieval
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_chat_context (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          context_type VARCHAR(50) NOT NULL,
          context_data JSONB NOT NULL,
          last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          session_count INTEGER DEFAULT 1,
          UNIQUE(user_id, context_type)
        )
      `)

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_memory_user_id ON chat_memory(user_id);
        CREATE INDEX IF NOT EXISTS idx_chat_memory_session_id ON chat_memory(session_id);
        CREATE INDEX IF NOT EXISTS idx_chat_memory_type ON chat_memory(user_id, memory_type);
        CREATE INDEX IF NOT EXISTS idx_chat_memory_importance ON chat_memory(user_id, importance DESC);
        CREATE INDEX IF NOT EXISTS idx_chat_memory_date ON chat_memory(user_id, extracted_at DESC);
        CREATE INDEX IF NOT EXISTS idx_user_chat_context_user_type ON user_chat_context(user_id, context_type);
      `)

      await client.query('COMMIT')
      console.log('✅ Chat memory database schema initialized successfully')
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('❌ Error initializing chat memory schema:', error)
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Extract important details from chat messages using AI with intelligent chunking
   */
  async extractFromChatHistory(
    userId: string, 
    sessionId: string, 
    messages: any[]
  ): Promise<ChatMemoryEntry[]> {
    try {
      // Filter out system messages and get user/assistant conversation
      const conversationMessages = messages.filter(msg => 
        msg.role === 'user' || msg.role === 'assistant'
      )

      if (conversationMessages.length === 0) {
        return []
      }

      // Initialize vector memory schema
      await neonVectorMemory.initializeVectorSchema()

      // Use intelligent chunking for large conversations
      const chunks = conversationChunker.adaptiveChunk(conversationMessages)
      
      console.log(`🧠 Processing ${chunks.length} conversation chunks for memory extraction`)
      
      const allMemoryEntries: ChatMemoryEntry[] = []
      let processedChunks = 0

      // Process chunks in order of importance
      const prioritizedChunks = conversationChunker.prioritizeChunks(chunks)
      
      for (const chunk of prioritizedChunks) {
        try {
          console.log(`📝 Processing chunk ${processedChunks + 1}/${chunks.length} (${chunk.messages.length} messages, ${chunk.tokenCount} tokens)`)
          
          // Extract key information from this chunk
          const extractedData = await this.extractKeyInformation(chunk.messages)
          
          // Convert extracted data to memory entries
          const chunkMemoryEntries: ChatMemoryEntry[] = []
          
          for (const extraction of extractedData) {
            const memoryEntry: ChatMemoryEntry = {
              userId,
              sessionId,
              extractedAt: new Date(),
              memoryType: extraction.type,
              summary: extraction.summary,
              details: extraction.details,
              confidence: extraction.confidence,
              importance: extraction.importance * chunk.importance, // Weight by chunk importance
              relatedSymptoms: extraction.symptoms || [],
              tags: [...(extraction.tags || []), `chunk_${chunk.chunkId}`],
              sourceMessages: extraction.sourceMessages || []
            }
            
            chunkMemoryEntries.push(memoryEntry)
          }

          // Store in both traditional and vector memory systems
          await Promise.all([
            this.storeChunkMemories(chunkMemoryEntries),
            neonVectorMemory.batchStoreMemories(userId, sessionId, extractedData)
          ])

          allMemoryEntries.push(...chunkMemoryEntries)
          processedChunks++
          
          // Rate limiting to avoid overwhelming APIs
          if (processedChunks < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
          
        } catch (error) {
          console.error(`❌ Error processing chunk ${processedChunks + 1}:`, error)
          continue
        }
      }

      // Update user context with all memories
      await this.updateUserContext(userId, allMemoryEntries)

      console.log(`✅ Extracted ${allMemoryEntries.length} memories from ${processedChunks} chunks`)
      return allMemoryEntries
    } catch (error) {
      console.error('❌ Error extracting from chat history:', error)
      return []
    }
  }

  /**
   * Store chunk memories in batch
   */
  private async storeChunkMemories(entries: ChatMemoryEntry[]): Promise<void> {
    for (const entry of entries) {
      try {
        await this.storeMemoryEntry(entry)
      } catch (error) {
        console.error('❌ Error storing chunk memory:', error)
      }
    }
  }

  /**
   * Use OpenAI to extract key information from conversation
   */
  private async extractKeyInformation(messages: any[]): Promise<any[]> {
    const conversationText = messages.map(msg => 
      `${msg.role.toUpperCase()}: ${msg.content}`
    ).join('\n\n')

    const prompt = `
Analyze this medical conversation and extract important details that should be remembered for future sessions. 
Focus on key medical information that would be valuable for continuity of care.

CONVERSATION:
${conversationText}

Extract the following types of information if present:
1. SYMPTOMS - Current or recurring symptoms mentioned
2. MEDICATIONS - Current medications, past medications, medication responses
3. MEDICAL_HISTORY - Past diagnoses, surgeries, medical events
4. LIFESTYLE - Diet, exercise, sleep patterns, stress factors
5. PREFERENCES - Communication preferences, treatment preferences
6. CONCERNS - Main health concerns or worries expressed
7. FOLLOW_UP - Items that need follow-up or monitoring

For each extracted item, provide:
- type: one of the categories above
- summary: brief description (max 50 words)
- details: structured data with specific information
- confidence: 0.0-1.0 how confident you are this is accurate
- importance: 0.0-1.0 how important this is for future sessions
- symptoms: array of related symptoms if applicable
- tags: array of relevant tags
- sourceMessages: array of key phrases from the conversation

Return as JSON array. Only include items that are medically relevant and would be useful for future sessions.
If no important information is found, return an empty array.

Example response:
[
  {
    "type": "symptom",
    "summary": "Recurring headaches for 2 weeks",
    "details": {
      "symptom": "headaches",
      "duration": "2 weeks",
      "frequency": "daily",
      "severity": "moderate",
      "triggers": ["stress", "lack of sleep"]
    },
    "confidence": 0.9,
    "importance": 0.8,
    "symptoms": ["headaches"],
    "tags": ["neurological", "recurring"],
    "sourceMessages": ["I've been having headaches every day for two weeks"]
  }
]
`

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a medical information extraction specialist. Extract key medical information from conversations that would be valuable for continuity of care.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      })

      const extractedText = response.choices[0]?.message?.content || '[]'
      
      // Parse JSON response
      try {
        const extracted = JSON.parse(extractedText)
        return Array.isArray(extracted) ? extracted : []
      } catch (parseError) {
        console.error('❌ Error parsing OpenAI extraction response:', parseError)
        return []
      }
    } catch (error) {
      console.error('❌ Error calling OpenAI for extraction:', error)
      return []
    }
  }

  /**
   * Store memory entry in database
   */
  private async storeMemoryEntry(entry: ChatMemoryEntry): Promise<string> {
    const client = await this.pool.connect()
    
    try {
      const result = await client.query(`
        INSERT INTO chat_memory (
          user_id, session_id, memory_type, summary, details, 
          confidence, importance, related_symptoms, tags, source_messages
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        entry.userId,
        entry.sessionId,
        entry.memoryType,
        entry.summary,
        JSON.stringify(entry.details),
        entry.confidence,
        entry.importance,
        entry.relatedSymptoms,
        entry.tags,
        entry.sourceMessages
      ])

      return result.rows[0].id
    } catch (error) {
      console.error('❌ Error storing memory entry:', error)
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Update user context with new memory entries
   */
  private async updateUserContext(userId: string, entries: ChatMemoryEntry[]): Promise<void> {
    const client = await this.pool.connect()
    
    try {
      // Group entries by type
      const groupedEntries: Record<string, ChatMemoryEntry[]> = {}
      entries.forEach(entry => {
        if (!groupedEntries[entry.memoryType]) {
          groupedEntries[entry.memoryType] = []
        }
        groupedEntries[entry.memoryType].push(entry)
      })

      // Update context for each type
      for (const [type, typeEntries] of Object.entries(groupedEntries)) {
        const contextData = typeEntries.map(entry => ({
          summary: entry.summary,
          details: entry.details,
          confidence: entry.confidence,
          importance: entry.importance,
          extractedAt: entry.extractedAt
        }))

        await client.query(`
          INSERT INTO user_chat_context (user_id, context_type, context_data)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, context_type)
          DO UPDATE SET 
            context_data = jsonb_set(
              COALESCE(user_chat_context.context_data, '[]'::jsonb), 
              '{-1}', 
              $3::jsonb
            ),
            last_updated = CURRENT_TIMESTAMP,
            session_count = user_chat_context.session_count + 1
        `, [userId, type, JSON.stringify(contextData)])
      }
    } catch (error) {
      console.error('❌ Error updating user context:', error)
    } finally {
      client.release()
    }
  }

  /**
   * Get user's chat context for enhanced AI responses
   */
  async getUserChatContext(userId: string): Promise<ChatContext> {
    const client = await this.pool.connect()
    
    try {
      const result = await client.query(`
        SELECT context_type, context_data, last_updated, session_count
        FROM user_chat_context 
        WHERE user_id = $1
        ORDER BY last_updated DESC
      `, [userId])

      const context: ChatContext = {
        previousSymptoms: [],
        currentMedications: [],
        chronicConditions: [],
        lifestyleFactors: {},
        userPreferences: {},
        previousConcerns: [],
        followUpNeeded: [],
        medicalHistory: []
      }

      for (const row of result.rows) {
        const contextData = typeof row.context_data === 'string' 
          ? JSON.parse(row.context_data) 
          : row.context_data

        switch (row.context_type) {
          case 'symptom':
            context.previousSymptoms = this.extractSymptoms(contextData)
            break
          case 'medication':
            context.currentMedications = this.extractMedications(contextData)
            break
          case 'medical_history':
            context.medicalHistory = this.extractMedicalHistory(contextData)
            break
          case 'lifestyle':
            context.lifestyleFactors = this.extractLifestyle(contextData)
            break
          case 'preference':
            context.userPreferences = this.extractPreferences(contextData)
            break
          case 'concern':
            context.previousConcerns = this.extractConcerns(contextData)
            break
          case 'follow_up':
            context.followUpNeeded = this.extractFollowUps(contextData)
            break
        }
      }

      return context
    } catch (error) {
      console.error('❌ Error getting user chat context:', error)
      return {
        previousSymptoms: [],
        currentMedications: [],
        chronicConditions: [],
        lifestyleFactors: {},
        userPreferences: {},
        previousConcerns: [],
        followUpNeeded: [],
        medicalHistory: []
      }
    } finally {
      client.release()
    }
  }

  /**
   * Generate contextual summary for AI responses using vector search
   */
  async generateContextualSummary(userId: string, currentQuery?: string): Promise<string> {
    try {
      // Use vector search for more relevant context if query provided
      if (currentQuery) {
        return await neonVectorMemory.getContextualMemories(userId, currentQuery)
      }

      // Fallback to traditional context
      const context = await this.getUserChatContext(userId)
      
      let summary = ''
      
      if (context.previousSymptoms.length > 0) {
        summary += `**Previous Symptoms:** ${context.previousSymptoms.slice(0, 5).join(', ')}\n`
      }
      
      if (context.currentMedications.length > 0) {
        summary += `**Current Medications:** ${context.currentMedications.slice(0, 5).join(', ')}\n`
      }
      
      if (context.medicalHistory.length > 0) {
        summary += `**Medical History:** ${context.medicalHistory.slice(0, 3).join(', ')}\n`
      }
      
      if (context.previousConcerns.length > 0) {
        summary += `**Previous Concerns:** ${context.previousConcerns.slice(0, 3).join(', ')}\n`
      }
      
      if (Object.keys(context.lifestyleFactors).length > 0) {
        const lifestyle = Object.entries(context.lifestyleFactors)
          .slice(0, 3)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')
        summary += `**Lifestyle Factors:** ${lifestyle}\n`
      }
      
      if (context.followUpNeeded.length > 0) {
        summary += `**Follow-up Needed:** ${context.followUpNeeded.slice(0, 3).join(', ')}\n`
      }

      return summary.trim()
    } catch (error) {
      console.error('❌ Error generating contextual summary:', error)
      return ''
    }
  }

  /**
   * Get semantic context for a specific query
   */
  async getSemanticContext(userId: string, query: string, symptoms: string[] = []): Promise<string> {
    try {
      return await neonVectorMemory.getContextualMemories(userId, query, symptoms)
    } catch (error) {
      console.error('❌ Error getting semantic context:', error)
      return ''
    }
  }

  // Helper methods to extract specific information from context data
  private extractSymptoms(contextData: any[]): string[] {
    return contextData.flatMap(item => 
      Array.isArray(item) ? item.flatMap(subItem => subItem.details?.symptom || []) : 
      [item.details?.symptom || item.summary]
    ).filter(Boolean)
  }

  private extractMedications(contextData: any[]): string[] {
    return contextData.flatMap(item =>
      Array.isArray(item) ? item.flatMap(subItem => subItem.details?.medication || []) :
      [item.details?.medication || item.summary]
    ).filter(Boolean)
  }

  private extractMedicalHistory(contextData: any[]): string[] {
    return contextData.flatMap(item =>
      Array.isArray(item) ? item.flatMap(subItem => subItem.details?.condition || []) :
      [item.details?.condition || item.summary]
    ).filter(Boolean)
  }

  private extractLifestyle(contextData: any[]): Record<string, string> {
    const lifestyle: Record<string, string> = {}
    contextData.forEach(item => {
      if (Array.isArray(item)) {
        item.forEach(subItem => {
          if (subItem.details && typeof subItem.details === 'object') {
            Object.assign(lifestyle, subItem.details)
          }
        })
      } else if (item.details && typeof item.details === 'object') {
        Object.assign(lifestyle, item.details)
      }
    })
    return lifestyle
  }

  private extractPreferences(contextData: any[]): Record<string, any> {
    const preferences: Record<string, any> = {}
    contextData.forEach(item => {
      if (Array.isArray(item)) {
        item.forEach(subItem => {
          if (subItem.details && typeof subItem.details === 'object') {
            Object.assign(preferences, subItem.details)
          }
        })
      } else if (item.details && typeof item.details === 'object') {
        Object.assign(preferences, item.details)
      }
    })
    return preferences
  }

  private extractConcerns(contextData: any[]): string[] {
    return contextData.flatMap(item =>
      Array.isArray(item) ? item.flatMap(subItem => subItem.details?.concern || []) :
      [item.details?.concern || item.summary]
    ).filter(Boolean)
  }

  private extractFollowUps(contextData: any[]): string[] {
    return contextData.flatMap(item =>
      Array.isArray(item) ? item.flatMap(subItem => subItem.details?.followUp || []) :
      [item.details?.followUp || item.summary]
    ).filter(Boolean)
  }
}

// Export singleton instance
export const chatMemoryExtractor = new ChatMemoryExtractor()