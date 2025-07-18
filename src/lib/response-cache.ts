/**
 * High-Performance Response Cache for Chat Sessions
 * Dramatically reduces chat response times through intelligent caching
 */

import { createHash } from 'crypto'

interface CacheEntry {
  response: string
  timestamp: number
  hitCount: number
}

interface OpenAIResponse {
  content: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

class ResponseCache {
  private cache = new Map<string, CacheEntry>()
  private readonly TTL = 60 * 60 * 1000 // 1 hour cache
  private readonly MAX_ENTRIES = 1000
  
  private generateCacheKey(userMessage: string, context: string): string {
    // Create deterministic cache key from message and context
    const safeMessage = userMessage || ''
    const normalizedMessage = safeMessage.toLowerCase().trim()
    const contextHash = createHash('md5').update(context || '').digest('hex').substring(0, 8)
    const messageHash = createHash('md5').update(normalizedMessage).digest('hex').substring(0, 8)
    
    return `${messageHash}-${contextHash}`
  }
  
  async getCachedResponse(
    userMessage: string, 
    diagnosticContext: string,
    healthContext: string
  ): Promise<string | null> {
    try {
      const cacheKey = this.generateCacheKey(
        userMessage, 
        diagnosticContext + healthContext
      )
      
      const entry = this.cache.get(cacheKey)
      
      if (!entry) {
        return null
      }
      
      // Check if cache entry is expired
      if (Date.now() - entry.timestamp > this.TTL) {
        this.cache.delete(cacheKey)
        return null
      }
      
      // Update hit count and return cached response
      entry.hitCount++
      console.log(`💾 Cache HIT for key: ${cacheKey} (hits: ${entry.hitCount})`)
      
      return entry.response
    } catch (error) {
      console.log('Cache retrieval error:', error)
      return null
    }
  }
  
  setCachedResponse(
    userMessage: string,
    diagnosticContext: string,
    healthContext: string,
    response: string
  ): void {
    try {
      const cacheKey = this.generateCacheKey(
        userMessage,
        diagnosticContext + healthContext
      )
      
      // Implement LRU eviction if cache is full
      if (this.cache.size >= this.MAX_ENTRIES) {
        const oldestKey = this.cache.keys().next().value
        if (oldestKey) {
          this.cache.delete(oldestKey)
        }
      }
      
      this.cache.set(cacheKey, {
        response,
        timestamp: Date.now(),
        hitCount: 0
      })
      
      console.log(`💾 Cache SET for key: ${cacheKey}`)
    } catch (error) {
      console.log('Cache storage error:', error)
    }
  }
  
  getCacheStats(): {
    size: number
    maxSize: number
    ttlMinutes: number
    topHits: Array<{ key: string; hits: number }>
  } {
    const entries = Array.from(this.cache.entries())
    const topHits = entries
      .sort(([,a], [,b]) => b.hitCount - a.hitCount)
      .slice(0, 10)
      .map(([key, entry]) => ({ key, hits: entry.hitCount }))
    
    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES,
      ttlMinutes: this.TTL / (60 * 1000),
      topHits
    }
  }
  
  clearCache(): void {
    this.cache.clear()
    console.log('💾 Response cache cleared')
  }
}

// Singleton instance for global use
export const responseCache = new ResponseCache()