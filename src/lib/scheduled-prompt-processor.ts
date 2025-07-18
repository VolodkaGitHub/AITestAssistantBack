// Scheduled Prompt Processing with OpenAI and @Mention Integration
import OpenAI from 'openai'
import { ScheduledPrompt, PromptExecution, recordPromptExecution } from './scheduled-prompts-database'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// @Mention data fetching interfaces
interface MentionDataFetcher {
  fetchWearableData(userId: string): Promise<any>
  fetchMedicalData(userId: string): Promise<any>
  fetchHealthData(userId: string): Promise<any>
}

class MentionDataService implements MentionDataFetcher {
  async fetchWearableData(userId: string): Promise<any> {
    try {
      // Fetch wearable data from Terra API
      const response = await fetch(`${process.env.NEXTAUTH_URL}/api/health-check/wearables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })
      
      if (!response.ok) {
        throw new Error(`Wearables API error: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error fetching wearable data:', error)
      return { error: 'Failed to fetch wearable data', devices: [] }
    }
  }

  async fetchMedicalData(userId: string): Promise<any> {
    try {
      // Fetch medications, lab results, vitals
      const [medicationsRes, labsRes, vitalsRes] = await Promise.allSettled([
        fetch(`${process.env.NEXTAUTH_URL}/api/health-check/medications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        }),
        fetch(`${process.env.NEXTAUTH_URL}/api/health-check/lab-results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        }),
        fetch(`${process.env.NEXTAUTH_URL}/api/health-check/vitals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        })
      ])

      const medications = medicationsRes.status === 'fulfilled' ? await medicationsRes.value.json() : { medications: [] }
      const labs = labsRes.status === 'fulfilled' ? await labsRes.value.json() : { labs: [] }
      const vitals = vitalsRes.status === 'fulfilled' ? await vitalsRes.value.json() : { vitals: [] }

      return {
        medications,
        lab_results: labs,
        vitals
      }
    } catch (error) {
      console.error('❌ Error fetching medical data:', error)
      return { medications: [], lab_results: [], vitals: [] }
    }
  }

  async fetchHealthData(userId: string): Promise<any> {
    try {
      // Fetch health timeline and overview
      const response = await fetch(`${process.env.NEXTAUTH_URL}/api/health-check/overview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })
      
      if (!response.ok) {
        throw new Error(`Health data API error: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error fetching health data:', error)
      return { timeline: [], summary: 'No health data available' }
    }
  }

  async fetchLinkedUserData(userId: string, linkedUserEmail: string): Promise<any> {
    try {
      // Fetch shared data from linked accounts
      const response = await fetch(`${process.env.NEXTAUTH_URL}/api/accounts/shared-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, linkedUserEmail })
      })
      
      if (!response.ok) {
        throw new Error(`Linked user data API error: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Error fetching linked user data:', error)
      return { shared_data: null, permissions: [] }
    }
  }
}

export class ScheduledPromptProcessor {
  private mentionDataService: MentionDataService

  constructor() {
    this.mentionDataService = new MentionDataService()
  }

  async processScheduledPrompt(prompt: ScheduledPrompt): Promise<PromptExecution> {
    const startTime = Date.now()
    
    try {
      console.log(`🚀 Processing scheduled prompt: ${prompt.title} for user ${prompt.user_id}`)

      // Fetch @mention data based on mentioned_data_types
      const mentionedData = await this.fetchMentionedData(prompt.user_id, prompt.mentioned_data_types)
      
      // Build OpenAI system prompt with @mention context
      const systemPrompt = this.buildSystemPrompt(prompt, mentionedData)
      
      // Process with OpenAI GPT-4o
      const openaiResponse = await this.processWithOpenAI(prompt.prompt_text, systemPrompt)
      
      // Format the result for email and storage
      const formattedResult = this.formatResultForEmail(openaiResponse, prompt.title, mentionedData)
      
      const executionDuration = Date.now() - startTime
      
      // Record successful execution
      const execution: Omit<PromptExecution, 'id' | 'execution_time'> = {
        prompt_id: prompt.id,
        user_id: prompt.user_id,
        ai_response: openaiResponse,
        data_sources_used: Object.keys(mentionedData),
        execution_status: 'success',
        error_message: '',
        response_time_ms: executionDuration,
        email_sent: false,
        email_delivery_status: 'not_sent'
      }

      const executionId = await recordPromptExecution(execution)
      
      console.log(`✅ Prompt processed successfully in ${executionDuration}ms`)
      
      return {
        id: executionId,
        execution_time: new Date(),
        ...execution
      }
      
    } catch (error) {
      const executionDuration = Date.now() - startTime
      console.error(`❌ Error processing scheduled prompt:`, error)
      
      // Record failed execution
      const execution: Omit<PromptExecution, 'id' | 'execution_time'> = {
        prompt_id: prompt.id,
        user_id: prompt.user_id,
        ai_response: '',
        data_sources_used: [],
        execution_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        response_time_ms: executionDuration,
        email_sent: false,
        email_delivery_status: 'not_sent'
      }

      const executionId = await recordPromptExecution(execution)
      
      return {
        id: executionId,
        execution_time: new Date(),
        ...execution
      }
    }
  }

  private async fetchMentionedData(userId: string, mentionedDataTypes: string[]): Promise<any> {
    const data: any = {}
    
    for (const dataType of mentionedDataTypes) {
      try {
        switch (dataType) {
          case 'wearable':
          case 'wearables':
          case 'oura-ring':
          case 'google-fit':
            data.wearables = await this.mentionDataService.fetchWearableData(userId)
            break
            
          case 'medical':
          case 'medications':
          case 'lab-results':
          case 'vitals':
            data.medical = await this.mentionDataService.fetchMedicalData(userId)
            break
            
          case 'health':
          case 'health-timeline':
            data.health = await this.mentionDataService.fetchHealthData(userId)
            break
            
          case 'linked-user':
            // Handle linked user data separately in email sharing
            break
            
          default:
            console.warn(`⚠️ Unknown mention data type: ${dataType}`)
        }
      } catch (error) {
        console.error(`❌ Error fetching ${dataType} data:`, error)
        data[dataType] = { error: `Failed to fetch ${dataType} data` }
      }
    }
    
    return data
  }

  private buildSystemPrompt(prompt: ScheduledPrompt, mentionedData: any): string {
    let systemPrompt = `You are an advanced AI health assistant analyzing a scheduled prompt with access to the user's real health data. 

Current Date: ${new Date().toISOString().split('T')[0]}
Prompt Title: ${prompt.title}
Execution Type: Scheduled ${prompt.schedule_type} execution

Available Health Context:`

    // Add wearable data context
    if (mentionedData.wearables) {
      systemPrompt += `

**Wearable Device Data:**`
      
      if (mentionedData.wearables.devices && mentionedData.wearables.devices.length > 0) {
        mentionedData.wearables.devices.forEach((device: any) => {
          systemPrompt += `
- ${device.provider_display}: ${device.status}
  Recent Activity: ${device.recent_activity || 'No recent data'}
  Last Sync: ${device.last_sync || 'Never'}`
        })
      } else {
        systemPrompt += `
- No wearable devices currently connected`
      }
    }

    // Add medical data context
    if (mentionedData.medical) {
      systemPrompt += `

**Medical Information:**`
      
      if (mentionedData.medical.medications?.medications?.length > 0) {
        systemPrompt += `
Current Medications: ${mentionedData.medical.medications.medications.map((med: any) => 
          `${med.medication_name} (${med.dosage})`).join(', ')}`
      }
      
      if (mentionedData.medical.lab_results?.labs?.length > 0) {
        systemPrompt += `
Recent Lab Results: ${mentionedData.medical.lab_results.labs.slice(0, 3).map((lab: any) => 
          `${lab.test_name}: ${lab.result} ${lab.unit}`).join(', ')}`
      }
      
      if (mentionedData.medical.vitals?.vitals?.length > 0) {
        const recentVitals = mentionedData.medical.vitals.vitals.slice(0, 3)
        systemPrompt += `
Recent Vitals: ${recentVitals.map((vital: any) => 
          `${vital.measurement_type}: ${vital.value} ${vital.unit}`).join(', ')}`
      }
    }

    // Add health timeline context
    if (mentionedData.health) {
      systemPrompt += `

**Health Timeline:**
${mentionedData.health.summary || 'No recent health timeline data'}`
    }

    systemPrompt += `

Instructions:
1. Analyze the user's prompt in the context of their real health data above
2. Provide personalized, actionable insights based on their actual health metrics
3. Reference specific data points when relevant (e.g., "Based on your recent Oura Ring data showing...")
4. Keep the response comprehensive but well-formatted for email delivery
5. Use a professional yet warm tone appropriate for health guidance
6. Always include disclaimers about consulting healthcare professionals for medical decisions

Remember: This is a scheduled automated analysis, so provide complete insights that stand alone.`

    return systemPrompt
  }

  private async processWithOpenAI(promptText: string, systemPrompt: string): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o', // Latest OpenAI model as specified in blueprint
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptText }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      })

      return completion.choices[0]?.message?.content || 'No response generated'
    } catch (error) {
      console.error('❌ OpenAI processing error:', error)
      throw new Error(`OpenAI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private formatResultForEmail(openaiResponse: string, promptTitle: string, mentionedData: any): string {
    const currentDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })

    let emailContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Scheduled Health Insight: ${promptTitle}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 16px; }
        .content { padding: 30px 20px; }
        .insight-content { background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .data-summary { background-color: #e3f2fd; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .data-summary h3 { margin: 0 0 10px 0; color: #1976d2; font-size: 16px; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; border-top: 1px solid #e9ecef; }
        .logo { font-weight: bold; color: #667eea; }
        .disclaimer { font-size: 12px; color: #999; margin-top: 15px; line-height: 1.4; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Scheduled Health Insight</h1>
            <p>${promptTitle}</p>
            <p>${currentDate}</p>
        </div>
        
        <div class="content">
            <div class="insight-content">
                ${this.formatOpenAIResponse(openaiResponse)}
            </div>`

    // Add data summary if mention data was used
    if (Object.keys(mentionedData).length > 0) {
      emailContent += `
            <div class="data-summary">
                <h3>📈 Data Sources Used</h3>
                ${this.formatDataSources(mentionedData)}
            </div>`
    }

    emailContent += `
        </div>
        
        <div class="footer">
            <div class="logo">Treatment AI - Global Library of Medicine™</div>
            <div class="disclaimer">
                This automated insight is for informational purposes only and should not replace professional medical advice. 
                Always consult with your healthcare provider for medical decisions and treatment plans.
            </div>
        </div>
    </div>
</body>
</html>`

    return emailContent
  }

  private formatOpenAIResponse(response: string): string {
    // Convert markdown-style formatting to HTML
    return response
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/\n\n/g, '</p><p>') // Paragraphs
      .replace(/\n- /g, '<br>• ') // Bullet points
      .replace(/^/, '<p>') // Start paragraph
      .replace(/$/, '</p>') // End paragraph
  }

  private formatDataSources(mentionedData: any): string {
    const sources = []

    if (mentionedData.wearables?.devices?.length > 0) {
      const deviceNames = mentionedData.wearables.devices.map((d: any) => d.provider_display).join(', ')
      sources.push(`🏃‍♂️ Wearable Devices: ${deviceNames}`)
    }

    if (mentionedData.medical?.medications?.medications?.length > 0) {
      sources.push(`💊 Current Medications: ${mentionedData.medical.medications.medications.length} items`)
    }

    if (mentionedData.medical?.lab_results?.labs?.length > 0) {
      sources.push(`🧪 Lab Results: ${mentionedData.medical.lab_results.labs.length} recent tests`)
    }

    if (mentionedData.medical?.vitals?.vitals?.length > 0) {
      sources.push(`📊 Vital Signs: ${mentionedData.medical.vitals.vitals.length} recent measurements`)
    }

    if (mentionedData.health?.timeline) {
      sources.push(`📋 Health Timeline: Recent activity summary`)
    }

    return sources.length > 0 ? sources.join('<br>') : 'No specific data sources referenced'
  }
}

export default ScheduledPromptProcessor