/**
 * Conversation Chunker - Intelligently chunks large conversations for memory extraction
 * Handles token limits and optimizes processing efficiency
 */

export interface ConversationChunk {
  messages: any[]
  startIndex: number
  endIndex: number
  tokenCount: number
  importance: number
  hasHealthContent: boolean
  chunkId: string
}

export interface ChunkingStrategy {
  maxTokensPerChunk: number
  overlapMessages: number
  prioritizeHealthContent: boolean
  minChunkSize: number
  maxChunkSize: number
}

class ConversationChunker {
  private defaultStrategy: ChunkingStrategy = {
    maxTokensPerChunk: 2000, // Safe for OpenAI processing
    overlapMessages: 2, // Maintain context between chunks
    prioritizeHealthContent: true,
    minChunkSize: 3, // Minimum messages per chunk
    maxChunkSize: 20 // Maximum messages per chunk
  }

  /**
   * Estimate token count for a message (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4)
  }

  /**
   * Calculate total token count for messages
   */
  private calculateTokenCount(messages: any[]): number {
    return messages.reduce((total, msg) => {
      return total + this.estimateTokens(msg.content || '')
    }, 0)
  }

  /**
   * Check if message contains health-related content
   */
  private hasHealthContent(message: any): boolean {
    const healthKeywords = [
      'pain', 'symptom', 'medication', 'doctor', 'hospital', 'diagnosis',
      'treatment', 'surgery', 'therapy', 'prescription', 'illness', 'disease',
      'health', 'medical', 'condition', 'chronic', 'acute', 'fever', 'cough',
      'headache', 'nausea', 'fatigue', 'injury', 'allergy', 'blood', 'pressure',
      'diabetes', 'heart', 'lung', 'kidney', 'liver', 'stomach', 'brain'
    ]

    const content = (message.content || '').toLowerCase()
    return healthKeywords.some(keyword => content.includes(keyword))
  }

  /**
   * Calculate importance score for a chunk
   */
  private calculateImportance(messages: any[]): number {
    let score = 0.5 // Base score

    // Higher score for health content
    const healthMessages = messages.filter(msg => this.hasHealthContent(msg))
    score += (healthMessages.length / messages.length) * 0.3

    // Higher score for user messages (more important than AI responses)
    const userMessages = messages.filter(msg => msg.role === 'user')
    score += (userMessages.length / messages.length) * 0.2

    // Higher score for recent messages
    const totalMessages = messages.length
    messages.forEach((msg, index) => {
      const recencyBonus = (index / totalMessages) * 0.1
      score += recencyBonus / totalMessages
    })

    return Math.min(1.0, score)
  }

  /**
   * Create intelligent chunks from conversation
   */
  chunkConversation(
    messages: any[], 
    strategy: Partial<ChunkingStrategy> = {}
  ): ConversationChunk[] {
    const config = { ...this.defaultStrategy, ...strategy }
    const chunks: ConversationChunk[] = []
    
    if (messages.length === 0) {
      return chunks
    }

    // Filter to user and assistant messages only
    const conversationMessages = messages.filter(msg => 
      msg.role === 'user' || msg.role === 'assistant'
    )

    let currentIndex = 0

    while (currentIndex < conversationMessages.length) {
      const chunk = this.createChunk(
        conversationMessages, 
        currentIndex, 
        config
      )
      
      if (chunk.messages.length >= config.minChunkSize) {
        chunks.push(chunk)
      }

      // Move to next chunk with overlap
      currentIndex = chunk.endIndex - config.overlapMessages + 1
      
      // Prevent infinite loop
      if (currentIndex <= chunk.startIndex) {
        currentIndex = chunk.endIndex + 1
      }
    }

    return chunks
  }

  /**
   * Create a single chunk starting from given index
   */
  private createChunk(
    messages: any[], 
    startIndex: number, 
    config: ChunkingStrategy
  ): ConversationChunk {
    let endIndex = startIndex
    let tokenCount = 0
    let chunkMessages: any[] = []

    // Build chunk within token and size limits
    while (
      endIndex < messages.length && 
      chunkMessages.length < config.maxChunkSize
    ) {
      const message = messages[endIndex]
      const messageTokens = this.estimateTokens(message.content || '')
      
      // Check if adding this message would exceed token limit
      if (tokenCount + messageTokens > config.maxTokensPerChunk && chunkMessages.length > 0) {
        break
      }

      chunkMessages.push(message)
      tokenCount += messageTokens
      endIndex++
    }

    // Ensure we have at least minimum messages
    if (chunkMessages.length < config.minChunkSize && endIndex < messages.length) {
      while (
        endIndex < messages.length && 
        chunkMessages.length < config.minChunkSize
      ) {
        chunkMessages.push(messages[endIndex])
        tokenCount += this.estimateTokens(messages[endIndex].content || '')
        endIndex++
      }
    }

    const hasHealthContent = chunkMessages.some(msg => this.hasHealthContent(msg))
    const importance = this.calculateImportance(chunkMessages)

    return {
      messages: chunkMessages,
      startIndex,
      endIndex: endIndex - 1,
      tokenCount,
      importance,
      hasHealthContent,
      chunkId: `chunk_${startIndex}_${endIndex - 1}_${Date.now()}`
    }
  }

  /**
   * Prioritize chunks for processing (most important first)
   */
  prioritizeChunks(chunks: ConversationChunk[]): ConversationChunk[] {
    return chunks.sort((a, b) => {
      // First priority: health content
      if (a.hasHealthContent && !b.hasHealthContent) return -1
      if (!a.hasHealthContent && b.hasHealthContent) return 1
      
      // Second priority: importance score
      if (a.importance !== b.importance) {
        return b.importance - a.importance
      }
      
      // Third priority: recency (later chunks first)
      return b.startIndex - a.startIndex
    })
  }

  /**
   * Get optimal chunks for memory extraction
   */
  getOptimalChunks(
    messages: any[], 
    maxChunks: number = 3,
    strategy: Partial<ChunkingStrategy> = {}
  ): ConversationChunk[] {
    const allChunks = this.chunkConversation(messages, strategy)
    const prioritizedChunks = this.prioritizeChunks(allChunks)
    
    return prioritizedChunks.slice(0, maxChunks)
  }

  /**
   * Smart chunking for different conversation lengths
   */
  adaptiveChunk(messages: any[]): ConversationChunk[] {
    const messageCount = messages.length
    
    if (messageCount <= 10) {
      // Small conversation - single chunk
      return this.chunkConversation(messages, {
        maxTokensPerChunk: 3000,
        minChunkSize: 1,
        maxChunkSize: messageCount
      })
    } else if (messageCount <= 30) {
      // Medium conversation - 2-3 chunks
      return this.getOptimalChunks(messages, 3, {
        maxTokensPerChunk: 2500,
        overlapMessages: 3
      })
    } else {
      // Large conversation - prioritize recent and health content
      return this.getOptimalChunks(messages, 4, {
        maxTokensPerChunk: 2000,
        overlapMessages: 2,
        prioritizeHealthContent: true
      })
    }
  }

  /**
   * Get chunking statistics
   */
  getChunkingStats(chunks: ConversationChunk[]): {
    totalChunks: number
    totalTokens: number
    avgTokensPerChunk: number
    healthContentChunks: number
    avgImportance: number
  } {
    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0)
    const healthChunks = chunks.filter(chunk => chunk.hasHealthContent).length
    const avgImportance = chunks.reduce((sum, chunk) => sum + chunk.importance, 0) / chunks.length

    return {
      totalChunks: chunks.length,
      totalTokens,
      avgTokensPerChunk: totalTokens / chunks.length,
      healthContentChunks: healthChunks,
      avgImportance
    }
  }
}

// Export singleton instance
export const conversationChunker = new ConversationChunker()