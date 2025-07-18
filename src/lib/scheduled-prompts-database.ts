// Scheduled Prompts Database Schema and Management
import { DatabasePool } from './database-pool';

export interface ScheduledPrompt {
  id: string
  user_id: string
  title: string
  prompt_text: string
  mentioned_data_types: string[] // Array of @mention types used
  schedule_type: 'once' | 'daily' | 'weekly' | 'monthly'
  scheduled_time: Date
  timezone: string
  is_active: boolean
  created_at: Date
  updated_at: Date
  last_executed?: Date
  next_execution?: Date
  execution_count: number
  email_delivery: boolean
  shared_with?: string[] // Array of linked user emails
  sharing_permissions?: {
    view_results: boolean
    edit_prompt: boolean
    receive_emails: boolean
  }
}

export interface PromptExecution {
  id: string
  prompt_id: string
  user_id: string
  execution_time: Date
  ai_response: string
  data_sources_used: string[]
  execution_status: 'success' | 'failed' | 'partial'
  error_message?: string
  response_time_ms: number
  email_sent: boolean
  email_delivery_status?: string
}

export interface PromptSharing {
  id: string
  prompt_id: string
  shared_by_user_id: string
  shared_with_user_id: string
  permissions: {
    view_results: boolean
    edit_prompt: boolean
    receive_emails: boolean
  }
  shared_at: Date
  is_active: boolean
}

// Initialize scheduled prompts database tables
export async function initializeScheduledPromptsSchema(): Promise<void> {
  const client = await DatabasePool.getClient()
  
  try {
    // Create scheduled_prompts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_prompts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        prompt_text TEXT NOT NULL,
        mentioned_data_types TEXT[] DEFAULT '{}',
        schedule_type VARCHAR(20) NOT NULL CHECK (schedule_type IN ('once', 'daily', 'weekly', 'monthly')),
        scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
        timezone VARCHAR(50) DEFAULT 'UTC',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_executed TIMESTAMP WITH TIME ZONE,
        next_execution TIMESTAMP WITH TIME ZONE,
        execution_count INTEGER DEFAULT 0,
        email_delivery BOOLEAN DEFAULT false,
        shared_with TEXT[] DEFAULT '{}',
        sharing_permissions JSONB DEFAULT '{"view_results": false, "edit_prompt": false, "receive_emails": false}'
      )
    `)

    // Create prompt_executions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS prompt_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt_id UUID NOT NULL REFERENCES scheduled_prompts(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        execution_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ai_response TEXT NOT NULL,
        data_sources_used TEXT[] DEFAULT '{}',
        execution_status VARCHAR(20) DEFAULT 'success' CHECK (execution_status IN ('success', 'failed', 'partial')),
        error_message TEXT,
        response_time_ms INTEGER,
        email_sent BOOLEAN DEFAULT false,
        email_delivery_status VARCHAR(50)
      )
    `)

    // Create prompt_sharing table
    await client.query(`
      CREATE TABLE IF NOT EXISTS prompt_sharing (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt_id UUID NOT NULL REFERENCES scheduled_prompts(id) ON DELETE CASCADE,
        shared_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        shared_with_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permissions JSONB NOT NULL DEFAULT '{"view_results": false, "edit_prompt": false, "receive_emails": false}',
        shared_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(prompt_id, shared_by_user_id, shared_with_user_id)
      )
    `)

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_prompts_user_id ON scheduled_prompts(user_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_prompts_next_execution ON scheduled_prompts(next_execution) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_prompt_executions_prompt_id ON prompt_executions(prompt_id);
      CREATE INDEX IF NOT EXISTS idx_prompt_executions_execution_time ON prompt_executions(execution_time);
      CREATE INDEX IF NOT EXISTS idx_prompt_sharing_shared_with ON prompt_sharing(shared_with_user_id) WHERE is_active = true;
    `)

    console.log('✅ Scheduled prompts database schema initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing scheduled prompts schema:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function getUserScheduledPrompts(userId: string): Promise<ScheduledPrompt[]> {
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(`
      SELECT * FROM scheduled_prompts 
      WHERE user_id = $1 OR $2 = ANY(shared_with)
      ORDER BY created_at DESC
    `, [userId, userId])

    return result.rows.map((row: any) => ({
      ...row,
      mentioned_data_types: row.mentioned_data_types || [],
      shared_with: row.shared_with || [],
      sharing_permissions: row.sharing_permissions || { view_results: false, edit_prompt: false, receive_emails: false }
    }))
  } catch (error) {
    console.error('Error fetching user scheduled prompts:', error)
    return []
  } finally {
    client.release()
  }
}

export async function createScheduledPrompt(promptData: Omit<ScheduledPrompt, 'id' | 'created_at' | 'updated_at' | 'execution_count'>): Promise<string> {
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(`
      INSERT INTO scheduled_prompts (
        user_id, title, prompt_text, mentioned_data_types, schedule_type,
        scheduled_time, timezone, is_active, next_execution, email_delivery,
        shared_with, sharing_permissions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      promptData.user_id,
      promptData.title,
      promptData.prompt_text,
      promptData.mentioned_data_types || [],
      promptData.schedule_type,
      promptData.scheduled_time,
      promptData.timezone || 'UTC',
      promptData.is_active,
      promptData.next_execution,
      promptData.email_delivery,
      promptData.shared_with || [],
      promptData.sharing_permissions || { view_results: false, edit_prompt: false, receive_emails: false }
    ])

    return result.rows[0].id
  } catch (error) {
    console.error('Error creating scheduled prompt:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function updateScheduledPrompt(promptId: string, updates: Partial<ScheduledPrompt>): Promise<boolean> {
  const client = await DatabasePool.getClient()
  
  try {
    const setClauses = []
    const values = []
    let paramIndex = 1

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        setClauses.push(`${key} = $${paramIndex}`)
        values.push(value)
        paramIndex++
      }
    })

    if (setClauses.length === 0) return false

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`)
    values.push(promptId)

    const query = `
      UPDATE scheduled_prompts 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
    `

    const result = await client.query(query, values)
    return (result.rowCount ?? 0) > 0
  } catch (error) {
    console.error('Error updating scheduled prompt:', error)
    return false
  } finally {
    client.release()
  }
}

export async function deleteScheduledPrompt(promptId: string, userId: string): Promise<boolean> {
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(`
      DELETE FROM scheduled_prompts 
      WHERE id = $1 AND user_id = $2
    `, [promptId, userId])

    return (result.rowCount ?? 0) > 0
  } catch (error) {
    console.error('Error deleting scheduled prompt:', error)
    return false
  } finally {
    client.release()
  }
}

export async function getActivePromptsForExecution(): Promise<ScheduledPrompt[]> {
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(`
      SELECT * FROM scheduled_prompts 
      WHERE is_active = true 
      AND next_execution <= CURRENT_TIMESTAMP
      ORDER BY next_execution ASC
    `)

    return result.rows.map((row: any) => ({
      ...row,
      mentioned_data_types: row.mentioned_data_types || [],
      shared_with: row.shared_with || [],
      sharing_permissions: row.sharing_permissions || { view_results: false, edit_prompt: false, receive_emails: false }
    }))
  } catch (error) {
    console.error('Error fetching active prompts for execution:', error)
    return []
  } finally {
    client.release()
  }
}

// Alias for backward compatibility
export const getPromptsReadyForExecution = getActivePromptsForExecution

export async function recordPromptExecution(execution: Omit<PromptExecution, 'id' | 'execution_time'>): Promise<string> {
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(`
      INSERT INTO prompt_executions (
        prompt_id, user_id, ai_response, data_sources_used,
        execution_status, error_message, response_time_ms,
        email_sent, email_delivery_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      execution.prompt_id,
      execution.user_id,
      execution.ai_response,
      execution.data_sources_used || [],
      execution.execution_status,
      execution.error_message,
      execution.response_time_ms,
      execution.email_sent,
      execution.email_delivery_status
    ])

    return result.rows[0].id
  } catch (error) {
    console.error('Error recording prompt execution:', error)
    throw error
  } finally {
    client.release()
  }
}

export async function getPromptExecutions(promptId: string, limit: number = 10): Promise<PromptExecution[]> {
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(`
      SELECT * FROM prompt_executions 
      WHERE prompt_id = $1 
      ORDER BY execution_time DESC 
      LIMIT $2
    `, [promptId, limit])

    return result.rows
  } catch (error) {
    console.error('Error fetching prompt executions:', error)
    return []
  } finally {
    client.release()
  }
}

export async function calculateNextExecution(scheduleType: string, currentTime: Date, timezone: string = 'UTC'): Promise<Date | null> {
  const next = new Date(currentTime)
  
  switch (scheduleType) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      return next
    case 'weekly':
      next.setDate(next.getDate() + 7)
      return next
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      return next
    case 'once':
    default:
      // For 'once' type, don't schedule another execution
      return null
  }
}

export async function getPromptStatistics(userId: string): Promise<{
  total_prompts: number
  active_prompts: number
  total_executions: number
  email_enabled_prompts: number
}> {
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(`
      SELECT 
        COUNT(*) as total_prompts,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_prompts,
        COUNT(CASE WHEN email_delivery = true THEN 1 END) as email_enabled_prompts,
        COALESCE(SUM(execution_count), 0) as total_executions
      FROM scheduled_prompts 
      WHERE user_id = $1
    `, [userId])

    const stats = result.rows[0]
    return {
      total_prompts: parseInt(stats.total_prompts),
      active_prompts: parseInt(stats.active_prompts),
      total_executions: parseInt(stats.total_executions),
      email_enabled_prompts: parseInt(stats.email_enabled_prompts)
    }
  } catch (error) {
    console.error('Error fetching prompt statistics:', error)
    return {
      total_prompts: 0,
      active_prompts: 0,
      total_executions: 0,
      email_enabled_prompts: 0
    }
  } finally {
    client.release()
  }
}

// Export missing functions for compatibility
export const initializeScheduledPromptsDatabase = async () => {
  console.log('Scheduled prompts schema already initialized via database-pool')
}

export const sharePromptWithUser = async (promptId: string, sharedByUserId: string, sharedWithUserId: string, permissions: any): Promise<void> => {
  console.log('sharePromptWithUser called but not implemented in current schema')
  // This is a placeholder for compatibility - actual implementation would need prompt sharing schema
}