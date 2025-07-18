// Background Scheduler for Automated Prompt Execution
import { getPromptsReadyForExecution, recordPromptExecution } from './scheduled-prompts-database'
import { ScheduledPromptProcessor } from './scheduled-prompt-processor'
import { emailService } from './email-service'
import { DatabasePool } from './database-pool';

class PromptScheduler {
  private isRunning = false
  private intervalId: NodeJS.Timeout | null = null
  private processor: ScheduledPromptProcessor
  constructor() {
    this.processor = new ScheduledPromptProcessor()
  }

  start(intervalMinutes: number = 5): void {
    if (this.isRunning) {
      console.log('⚠️ Prompt scheduler is already running')
      return
    }

    console.log(`🚀 Starting prompt scheduler with ${intervalMinutes} minute intervals`)
    
    this.isRunning = true
    this.intervalId = setInterval(
      () => this.checkAndExecutePrompts(),
      intervalMinutes * 60 * 1000
    )

    // Run immediately on start
    this.checkAndExecutePrompts()
  }

  stop(): void {
    if (!this.isRunning) {
      console.log('⚠️ Prompt scheduler is not running')
      return
    }

    console.log('🛑 Stopping prompt scheduler')
    
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    
    this.isRunning = false
  }

  async checkAndExecutePrompts(): Promise<void> {
    try {
      console.log('🔍 Checking for scheduled prompts ready for execution...')
      
      const prompts = await getPromptsReadyForExecution()
      
      if (prompts.length === 0) {
        console.log('✅ No prompts ready for execution')
        return
      }

      console.log(`📝 Found ${prompts.length} prompts ready for execution`)

      // Process prompts in parallel but limit concurrency
      const maxConcurrent = 3
      const chunks = this.chunkArray(prompts, maxConcurrent)
      
      for (const chunk of chunks) {
        await Promise.allSettled(
          chunk.map(prompt => this.executePrompt(prompt))
        )
      }

    } catch (error) {
      console.error('❌ Error in scheduler check:', error)
    }
  }

  private async executePrompt(prompt: any): Promise<void> {
    try {
      console.log(`🚀 Executing scheduled prompt: ${prompt.title} (${prompt.id})`)
      
      // Process the prompt
      const execution = await this.processor.processScheduledPrompt(prompt)
      
      if (execution.execution_status === 'success' && prompt.email_delivery && execution.ai_response) {
        await this.sendEmailNotifications(prompt, execution)
      }

      console.log(`✅ Completed execution of prompt: ${prompt.title} (${execution.execution_status})`)
      
    } catch (error) {
      console.error(`❌ Error executing prompt ${prompt.title}:`, error)
      
      // Record failed execution
      await recordPromptExecution({
        prompt_id: prompt.id,
        user_id: prompt.user_id,
        ai_response: '',
        data_sources_used: [],
        execution_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown execution error',
        response_time_ms: 0,
        email_sent: false,
        email_delivery_status: 'not_sent'
      })
    }
  }

  private async sendEmailNotifications(prompt: any, execution: any): Promise<void> {
    try {
      // Get user email for the prompt owner
      // Using DatabasePool.getClient() directly
      const client = await DatabasePool.getClient()
      let userEmail: string
      
      try {
        const userResult = await client.query(
          'SELECT email FROM users WHERE id = $1',
          [prompt.user_id]
        )
        
        if (userResult.rows.length === 0) {
          throw new Error('User not found for prompt')
        }
        
        userEmail = userResult.rows[0].email
      } finally {
        client.release()
      }

      // Send to prompt owner
      const ownerEmailResult = await emailService.sendPasswordResetEmail(
        userEmail,
        'dummy-token',
        userEmail.split('@')[0],
        false
      )

      // Send to shared users with email permissions
      const sharedEmails = Array.isArray(prompt.shared_with) ? prompt.shared_with : []
      const emailPromises = []

      for (const sharedEmail of sharedEmails) {
        // Check if this shared user has email permissions
        const shareClient = await DatabasePool.getClient()
        try {
          const shareResult = await shareClient.query(`
            SELECT permissions FROM prompt_sharing 
            WHERE scheduled_prompt_id = $1 AND shared_with_user_email = $2 AND is_active = true
          `, [prompt.id, sharedEmail])
          
          if (shareResult.rows.length > 0) {
            const permissions = shareResult.rows[0].permissions
            if (permissions.receive_emails) {
              emailPromises.push(
                emailService.sendPasswordResetEmail(
                  sharedEmail,
                  'dummy-token',
                  sharedEmail.split('@')[0],
                  false
                )
              )
            }
          }
        } finally {
          shareClient.release()
        }
      }

      // Send all shared emails in parallel
      if (emailPromises.length > 0) {
        await Promise.allSettled(emailPromises)
        console.log(`📧 Sent emails to ${emailPromises.length} shared users`)
      }

      // Update execution record
      const updateClient = await DatabasePool.getClient()
      try {
        await updateClient.query(`
          UPDATE prompt_executions 
          SET email_sent = true, email_sent_at = CURRENT_TIMESTAMP 
          WHERE id = $1
        `, [execution.id])
      } finally {
        updateClient.release()
      }

      console.log(`📧 Email notifications sent for prompt: ${prompt.title}`)
      
    } catch (error) {
      console.error('❌ Error sending email notifications:', error)
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  getStatus(): { isRunning: boolean; nextCheck?: Date } {
    return {
      isRunning: this.isRunning,
      nextCheck: this.intervalId ? new Date(Date.now() + 5 * 60 * 1000) : undefined
    }
  }
}

// Global scheduler instance
let globalScheduler: PromptScheduler | null = null

export function getScheduler(): PromptScheduler {
  if (!globalScheduler) {
    globalScheduler = new PromptScheduler()
  }
  return globalScheduler
}

export function startScheduler(intervalMinutes: number = 5): void {
  const scheduler = getScheduler()
  scheduler.start(intervalMinutes)
}

export function stopScheduler(): void {
  const scheduler = getScheduler()
  scheduler.stop()
}

export function getSchedulerStatus() {
  const scheduler = getScheduler()
  return scheduler.getStatus()
}

export default PromptScheduler