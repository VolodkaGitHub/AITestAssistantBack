/**
 * OpenAI Cost Tracker
 * Tracks token usage and calculates real costs based on current OpenAI pricing
 */

// Current OpenAI GPT-4o pricing (as of January 2025)
const OPENAI_PRICING = {
  'gpt-4o': {
    input: 0.0025,   // $2.50 per 1M input tokens
    output: 0.01     // $10.00 per 1M output tokens
  }
}

export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface ChatCost {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  callCount: number
}

class CostTracker {
  private sessionCosts: Map<string, ChatCost> = new Map()

  /**
   * Add token usage for a session
   */
  addUsage(sessionId: string, usage: TokenUsage, model: string = 'gpt-4o'): void {
    const pricing = OPENAI_PRICING[model as keyof typeof OPENAI_PRICING]
    if (!pricing) {
      console.warn(`Unknown model for pricing: ${model}`)
      return
    }

    const existing = this.sessionCosts.get(sessionId) || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      callCount: 0
    }

    const inputCost = (usage.prompt_tokens / 1000000) * pricing.input
    const outputCost = (usage.completion_tokens / 1000000) * pricing.output

    const updated: ChatCost = {
      inputTokens: existing.inputTokens + usage.prompt_tokens,
      outputTokens: existing.outputTokens + usage.completion_tokens,
      totalTokens: existing.totalTokens + usage.total_tokens,
      inputCost: existing.inputCost + inputCost,
      outputCost: existing.outputCost + outputCost,
      totalCost: existing.totalCost + inputCost + outputCost,
      callCount: existing.callCount + 1
    }

    this.sessionCosts.set(sessionId, updated)
    
    // Store in localStorage for persistence
    this.saveToLocalStorage()
  }

  /**
   * Get cost data for a session
   */
  getCosts(sessionId: string): ChatCost | null {
    return this.sessionCosts.get(sessionId) || null
  }

  /**
   * Clear costs for a session
   */
  clearSession(sessionId: string): void {
    this.sessionCosts.delete(sessionId)
    this.saveToLocalStorage()
  }

  /**
   * Clear all cost data
   */
  clearAll(): void {
    this.sessionCosts.clear()
    if (typeof window !== 'undefined') {
      localStorage.removeItem('openai-costs')
    }
  }

  /**
   * Format cost as currency
   */
  formatCost(cost: number): string {
    return `$${cost.toFixed(4)}`
  }

  /**
   * Save to localStorage
   */
  private saveToLocalStorage(): void {
    if (typeof window !== 'undefined') {
      const data = Object.fromEntries(this.sessionCosts)
      localStorage.setItem('openai-costs', JSON.stringify(data))
    }
  }

  /**
   * Load from localStorage
   */
  loadFromLocalStorage(): void {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('openai-costs')
      if (saved) {
        try {
          const data = JSON.parse(saved)
          this.sessionCosts = new Map(Object.entries(data))
        } catch (error) {
          console.error('Failed to load cost data:', error)
        }
      }
    }
  }
}

export const costTracker = new CostTracker()

// Load saved data on initialization
if (typeof window !== 'undefined') {
  costTracker.loadFromLocalStorage()
}