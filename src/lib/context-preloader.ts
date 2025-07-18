/**
 * Context Preloader - Preloads mention context and automatic health context
 * when user signs in to improve chat performance
 */

import { MentionDataService } from './mention-data-service'

export interface PreloadedContextData {
  mentionContext: {
    wearables: any
    medications: any
    labResults: any
    healthTimeline: any
    vitals: any
    conditions: any
  }
  automaticHealthContext: string
  healthContext: string
  timestamp: number
}

export class ContextPreloader {
  private static instance: ContextPreloader
  private preloadedData: Map<string, PreloadedContextData> = new Map()
  private readonly CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  static getInstance(): ContextPreloader {
    if (!ContextPreloader.instance) {
      ContextPreloader.instance = new ContextPreloader()
    }
    return ContextPreloader.instance
  }

  /**
   * Preload all context data for a user after authentication
   */
  async preloadUserContext(userId: string, sessionToken: string): Promise<void> {
    try {
      console.log('🔄 Starting context preload for user:', userId)
      
      // Initialize MentionDataService
      const mentionService = new MentionDataService(sessionToken, userId)
      
      // Preload all mention context in parallel
      const mentionContextPromises = [
        mentionService.fetchMentionData('wearables').catch(err => {
          console.warn('Failed to preload wearables:', err)
          return null
        }),
        mentionService.fetchMentionData('medications').catch(err => {
          console.warn('Failed to preload medications:', err)
          return null
        }),
        mentionService.fetchMentionData('lab_results').catch(err => {
          console.warn('Failed to preload lab results:', err)
          return null
        }),
        mentionService.fetchMentionData('health_timeline').catch(err => {
          console.warn('Failed to preload health timeline:', err)
          return null
        }),
        mentionService.fetchMentionData('vitals').catch(err => {
          console.warn('Failed to preload vitals:', err)
          return null
        }),
        mentionService.fetchMentionData('conditions').catch(err => {
          console.warn('Failed to preload conditions:', err)
          return null
        })
      ]

      // Preload automatic health context and health context via API endpoints
      const contextPromises = [
        this.fetchAutomaticHealthContext(userId, sessionToken).catch(err => {
          console.warn('Failed to preload automatic health context:', err)
          return ''
        }),
        this.fetchHealthContext(userId, sessionToken).catch(err => {
          console.warn('Failed to preload health context:', err)
          return ''
        })
      ]

      // Wait for all data to load
      const [
        wearables,
        medications,
        labResults,
        healthTimeline,
        vitals,
        conditions
      ] = await Promise.all(mentionContextPromises)

      const [automaticHealthContext, healthContext] = await Promise.all(contextPromises)

      // Store preloaded data
      const preloadedData: PreloadedContextData = {
        mentionContext: {
          wearables,
          medications,
          labResults,
          healthTimeline,
          vitals,
          conditions
        },
        automaticHealthContext,
        healthContext,
        timestamp: Date.now()
      }

      this.preloadedData.set(userId, preloadedData)
      console.log('✅ Context preload completed for user:', userId)
      
    } catch (error) {
      console.error('❌ Context preload failed for user:', userId, error)
      // Don't throw error - preloading is optional enhancement
    }
  }

  /**
   * Get preloaded context data for a user
   */
  getPreloadedContext(userId: string): PreloadedContextData | null {
    const cached = this.preloadedData.get(userId)
    
    if (!cached) {
      return null
    }

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.preloadedData.delete(userId)
      return null
    }

    return cached
  }

  /**
   * Get specific mention data from preloaded context
   */
  getPreloadedMentionData(userId: string, mentionType: string): any | null {
    const context = this.getPreloadedContext(userId)
    if (!context) return null

    return context.mentionContext[mentionType as keyof typeof context.mentionContext] || null
  }

  /**
   * Get automatic health context from preloaded data
   */
  getPreloadedAutomaticHealthContext(userId: string): string | null {
    const context = this.getPreloadedContext(userId)
    return context?.automaticHealthContext || null
  }

  /**
   * Get health context from preloaded data
   */
  getPreloadedHealthContext(userId: string): string | null {
    const context = this.getPreloadedContext(userId)
    return context?.healthContext || null
  }

  /**
   * Clear preloaded data for a user (e.g., on logout)
   */
  clearUserContext(userId: string): void {
    this.preloadedData.delete(userId)
    console.log('🗑️ Cleared preloaded context for user:', userId)
  }

  /**
   * Clear all preloaded data
   */
  clearAllContexts(): void {
    this.preloadedData.clear()
    console.log('🗑️ Cleared all preloaded contexts')
  }

  /**
   * Fetch automatic health context via API
   */
  private async fetchAutomaticHealthContext(userId: string, sessionToken: string): Promise<string> {
    try {
      const response = await fetch('/api/health/automatic-context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ userId })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      return data.context || ''
    } catch (error) {
      console.error('Error fetching automatic health context:', error)
      return ''
    }
  }

  /**
   * Fetch health context via API
   */
  private async fetchHealthContext(userId: string, sessionToken: string): Promise<string> {
    try {
      const response = await fetch('/api/health/context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ userId })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      return data.context || ''
    } catch (error) {
      console.error('Error fetching health context:', error)
      return ''
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { userCount: number; cacheSize: number } {
    return {
      userCount: this.preloadedData.size,
      cacheSize: JSON.stringify(Array.from(this.preloadedData.entries())).length
    }
  }
}

export const contextPreloader = ContextPreloader.getInstance()