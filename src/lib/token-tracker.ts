/**
 * Token Usage Tracking System
 * Automatically logs all API calls with token usage and costs
 */

import { DatabasePool } from './database-pool';

interface TokenUsageLog {
  userId?: string
  sessionId?: string
  apiType: 'openai' | 'merlin' | 'terra' | 'didyouknow'
  endpoint: string
  tokensUsed: number
  estimatedCost: number
  responseTimeMs: number
  statusCode: number
  errorMessage?: string
  userAgent?: string
  ipAddress?: string
}

class TokenTracker {
  private static instance: TokenTracker

  private constructor() {
    this.initializeDatabase()
  }

  public static getInstance(): TokenTracker {
    if (!TokenTracker.instance) {
      TokenTracker.instance = new TokenTracker()
    }
    return TokenTracker.instance
  }

  private async initializeDatabase() {
    try {
      const client = await DatabasePool.getClient()
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS api_usage_logs (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255),
            session_id VARCHAR(255),
            api_type VARCHAR(50) NOT NULL,
            endpoint VARCHAR(255) NOT NULL,
            tokens_used INTEGER DEFAULT 0,
            estimated_cost DECIMAL(10, 6) DEFAULT 0,
            response_time_ms INTEGER DEFAULT 0,
            status_code INTEGER DEFAULT 200,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            user_agent TEXT,
            ip_address INET
          )
        `)

        // Create indexes for better performance
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_logs(created_at);
          CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage_logs(user_id);
          CREATE INDEX IF NOT EXISTS idx_api_usage_api_type ON api_usage_logs(api_type);
          CREATE INDEX IF NOT EXISTS idx_api_usage_session_id ON api_usage_logs(session_id);
        `)
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Failed to initialize token tracking database:', error)
    }
  }

  public async logTokenUsage(log: TokenUsageLog): Promise<void> {
    try {
      const client = await DatabasePool.getClient()
      try {
        await client.query(`
          INSERT INTO api_usage_logs (
            user_id, session_id, api_type, endpoint, tokens_used, 
            estimated_cost, response_time_ms, status_code, error_message,
            user_agent, ip_address
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          log.userId || null,
          log.sessionId || null,
          log.apiType,
          log.endpoint,
          log.tokensUsed,
          log.estimatedCost,
          log.responseTimeMs,
          log.statusCode,
          log.errorMessage || null,
          log.userAgent || null,
          log.ipAddress ? log.ipAddress.split(',')[0].trim() : null
        ])
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('Failed to log token usage:', error)
      // Don't throw error to avoid breaking the main application flow
    }
  }

  // OpenAI token counting and cost calculation
  public calculateOpenAICost(tokens: number, model: string = 'gpt-4o'): number {
    // OpenAI pricing as of 2024 (per 1000 tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 0.0025, output: 0.01 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }
    }

    const modelPricing = pricing[model] || pricing['gpt-4o']
    // Estimate 70% input tokens, 30% output tokens
    const inputTokens = Math.round(tokens * 0.7)
    const outputTokens = Math.round(tokens * 0.3)
    
    return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000
  }

  // Count tokens in text (rough estimation)
  public countTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4)
  }

  // Extract user context from request headers (first implementation)
  public extractUserContext(req: any): { userId?: string; sessionId?: string; userAgent?: string; ipAddress?: string } {
    try {
      return {
        userId: req.body?.userId || req.query?.userId || req.headers?.['x-user-id'],
        sessionId: req.body?.sessionId || req.query?.sessionId || req.headers?.['x-session-id'],
        userAgent: req.headers?.['user-agent'],
        ipAddress: req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress
      }
    } catch {
      return {}
    }
  }

  // Wrapper for OpenAI API calls
  public async trackOpenAICall<T>(
    apiCall: () => Promise<T>,
    context: { 
      userId?: string; 
      sessionId?: string; 
      endpoint: string; 
      inputText: string;
      userAgent?: string;
      ipAddress?: string;
    }
  ): Promise<T> {
    const startTime = Date.now()
    let result: T
    let statusCode = 200
    let errorMessage: string | undefined

    try {
      result = await apiCall()
      return result
    } catch (error) {
      statusCode = error instanceof Error && 'status' in error ? (error as any).status : 500
      errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw error
    } finally {
      const responseTime = Date.now() - startTime
      const tokens = this.countTokens(context.inputText)
      const cost = this.calculateOpenAICost(tokens)

      await this.logTokenUsage({
        userId: context.userId,
        sessionId: context.sessionId,
        apiType: 'openai',
        endpoint: context.endpoint,
        tokensUsed: tokens,
        estimatedCost: cost,
        responseTimeMs: responseTime,
        statusCode,
        errorMessage,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress
      })
    }
  }

  // Wrapper for Merlin API calls
  public async trackMerlinCall<T>(
    apiCall: () => Promise<T>,
    context: { 
      userId?: string; 
      sessionId?: string; 
      endpoint: string;
      userAgent?: string;
      ipAddress?: string;
    }
  ): Promise<T> {
    const startTime = Date.now()
    let result: T
    let statusCode = 200
    let errorMessage: string | undefined

    try {
      result = await apiCall()
      return result
    } catch (error) {
      statusCode = error instanceof Error && 'status' in error ? (error as any).status : 500
      errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw error
    } finally {
      const responseTime = Date.now() - startTime

      await this.logTokenUsage({
        userId: context.userId,
        sessionId: context.sessionId,
        apiType: 'merlin',
        endpoint: context.endpoint,
        tokensUsed: 0, // Merlin doesn't use tokens
        estimatedCost: 0, // Free API
        responseTimeMs: responseTime,
        statusCode,
        errorMessage,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress
      })
    }
  }

  // Wrapper for Terra API calls  
  public async trackTerraCall<T>(
    apiCall: () => Promise<T>,
    context: { 
      userId?: string; 
      sessionId?: string; 
      endpoint: string;
      userAgent?: string;
      ipAddress?: string;
    }
  ): Promise<T> {
    const startTime = Date.now()
    let result: T
    let statusCode = 200
    let errorMessage: string | undefined

    try {
      result = await apiCall()
      return result
    } catch (error) {
      statusCode = error instanceof Error && 'status' in error ? (error as any).status : 500
      errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw error
    } finally {
      const responseTime = Date.now() - startTime

      await this.logTokenUsage({
        userId: context.userId,
        sessionId: context.sessionId,
        apiType: 'terra',
        endpoint: context.endpoint,
        tokensUsed: 0, // Terra doesn't use tokens
        estimatedCost: 0, // Paid separately
        responseTimeMs: responseTime,
        statusCode,
        errorMessage,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress
      })
    }
  }

  // Get usage summary for a user
  public async getUserUsageSummary(userId: string, days: number = 30): Promise<{
    totalTokens: number;
    totalCost: number;
    totalCalls: number;
    byApiType: Record<string, { tokens: number; cost: number; calls: number }>;
  }> {
    try {
      const client = await DatabasePool.getClient()
      let result
      try {
        result = await client.query(`
          SELECT 
            api_type,
            SUM(tokens_used) as total_tokens,
            SUM(estimated_cost) as total_cost,
            COUNT(*) as total_calls
          FROM api_usage_logs 
          WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${days} days'
          GROUP BY api_type
        `, [userId])
      } finally {
        client.release()
      }

      const byApiType: Record<string, { tokens: number; cost: number; calls: number }> = {}
      let totalTokens = 0
      let totalCost = 0
      let totalCalls = 0

      for (const row of result.rows) {
        const tokens = parseInt(row.total_tokens) || 0
        const cost = parseFloat(row.total_cost) || 0
        const calls = parseInt(row.total_calls) || 0

        byApiType[row.api_type] = { tokens, cost, calls }
        totalTokens += tokens
        totalCost += cost
        totalCalls += calls
      }

      return { totalTokens, totalCost, totalCalls, byApiType }
    } catch (error) {
      console.error('Failed to get user usage summary:', error)
      return { totalTokens: 0, totalCost: 0, totalCalls: 0, byApiType: {} }
    }
  }
}

export default TokenTracker