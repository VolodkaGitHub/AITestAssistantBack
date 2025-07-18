import OpenAI from 'openai'
import { getHealthContextForUser } from './health-context'
import { userAgentProfileManager, UserAgentPersonality, UserGoal, UserAgentMemory } from './user-agent-profile'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface PersonalAgentContext {
  userId: string
  healthData: any
  personality: UserAgentPersonality | null
  goals: UserGoal[]
  memories: UserAgentMemory[]
  currentSession: {
    conversationHistory: any[]
    contextTags: string[]
  }
}

export class PersonalAIAgent {
  private userId: string
  private context: PersonalAgentContext | null = null

  constructor(userId: string) {
    this.userId = userId
  }

  async initializeAgent(): Promise<void> {
    // Initialize database schema if needed
    await userAgentProfileManager.initializeSchema()

    // Load comprehensive user profile
    const [healthData, agentProfile] = await Promise.all([
      getHealthContextForUser(this.userId),
      userAgentProfileManager.getComprehensiveAgentProfile(this.userId)
    ])

    this.context = {
      userId: this.userId,
      healthData: this.parseHealthData(healthData),
      personality: agentProfile.personality,
      goals: agentProfile.goals,
      memories: agentProfile.recentMemories,
      currentSession: {
        conversationHistory: [],
        contextTags: []
      }
    }

    // Create default personality if none exists
    if (!this.context.personality) {
      await this.createDefaultPersonality()
    }
  }

  private parseHealthData(healthContextString: string): any {
    if (!healthContextString) return null
    
    try {
      // Extract structured data from health context string
      const sections = healthContextString.split('\n\n')
      const healthData: any = {}
      
      for (const section of sections) {
        if (section.includes('Current Medications:')) {
          healthData.medications = this.extractMedications(section)
        } else if (section.includes('Connected Wearable Devices:')) {
          healthData.wearables = this.extractWearables(section)
        } else if (section.includes('Recent Health Timeline:')) {
          healthData.timeline = this.extractTimeline(section)
        }
      }
      
      return healthData
    } catch (error) {
      console.log('Error parsing health data:', error)
      return null
    }
  }

  private extractMedications(section: string): any[] {
    const lines = section.split('\n').slice(1) // Skip header
    return lines.filter(line => line.trim().startsWith('•')).map(line => {
      const text = line.replace('•', '').trim()
      const parts = text.split(' - ')
      return {
        name: parts[0] || text,
        details: parts[1] || ''
      }
    })
  }

  private extractWearables(section: string): any[] {
    const lines = section.split('\n').slice(1)
    return lines.filter(line => line.trim().startsWith('•')).map(line => {
      const text = line.replace('•', '').trim()
      return { device: text }
    })
  }

  private extractTimeline(section: string): any[] {
    const lines = section.split('\n').slice(1)
    return lines.filter(line => line.trim().startsWith('•')).map(line => {
      const text = line.replace('•', '').trim()
      return { event: text }
    })
  }

  private async createDefaultPersonality(): Promise<void> {
    const defaultPersonality = {
      communication_style: 'friendly' as const,
      medical_expertise_level: 'basic' as const,
      focus_areas: ['general_health'],
      preferred_language: 'en',
      reminder_frequency: 'weekly' as const,
      proactive_suggestions: true,
      privacy_level: 'moderate' as const
    }

    const personality = await userAgentProfileManager.createOrUpdateAgentPersonality(
      this.userId, 
      defaultPersonality
    )
    
    if (this.context) {
      this.context.personality = personality
    }
  }

  generatePersonalizedSystemPrompt(): string {
    if (!this.context) {
      throw new Error('Agent not initialized. Call initializeAgent() first.')
    }

    const { personality, goals, memories, healthData } = this.context

    let prompt = `You are a personalized AI health assistant specifically designed for this user. You have complete knowledge of their health profile and personal preferences.

## Your Personality & Communication Style:
- Communication Style: ${personality?.communication_style || 'friendly'}
- Medical Expertise Level: ${personality?.medical_expertise_level || 'basic'}
- Focus Areas: ${personality?.focus_areas?.join(', ') || 'general health'}
- Language: ${personality?.preferred_language || 'English'}

## User's Health Goals:`

    if (goals.length > 0) {
      goals.forEach(goal => {
        prompt += `
- ${goal.title}: ${goal.description} (Priority: ${goal.priority})`
        if (goal.target_value && goal.target_unit) {
          prompt += ` Target: ${goal.target_value} ${goal.target_unit}`
        }
      })
    } else {
      prompt += `
- No specific health goals set yet. Consider asking about their health objectives.`
    }

    prompt += `

## Important Memories & Context:`
    if (memories.length > 0) {
      memories.slice(0, 10).forEach(memory => {
        prompt += `
- ${memory.memory_type}: ${memory.content} (Importance: ${memory.importance_score}/10)`
      })
    } else {
      prompt += `
- This is a new relationship. Pay attention to preferences and concerns to build your understanding.`
    }

    prompt += `

## Current Health Data:`
    if (healthData) {
      if (healthData.medications?.length > 0) {
        prompt += `
### Medications:
${healthData.medications.map((med: any) => `- ${med.name}: ${med.details}`).join('\n')}`
      }

      if (healthData.wearables?.length > 0) {
        prompt += `
### Connected Devices:
${healthData.wearables.map((device: any) => `- ${device.device}`).join('\n')}`
      }

      if (healthData.timeline?.length > 0) {
        prompt += `
### Recent Health Events:
${healthData.timeline.map((event: any) => `- ${event.event}`).join('\n')}`
      }
    }

    prompt += `

## Your Role:
- Act as their personal health companion who knows their complete history
- Reference their goals, medications, and health data naturally in conversations
- Remember their preferences and build on previous interactions
- ${personality?.proactive_suggestions ? 'Offer proactive suggestions based on their data and goals' : 'Wait for them to ask before making suggestions'}
- Maintain appropriate medical disclaimers while being personally supportive

## Communication Guidelines:
- Use ${personality?.communication_style === 'professional' ? 'professional, clinical language' : 
         personality?.communication_style === 'friendly' ? 'warm, approachable language' :
         personality?.communication_style === 'motivational' ? 'encouraging, energetic language' :
         personality?.communication_style === 'direct' ? 'clear, concise language' :
         'empathetic, understanding language'}
- Adapt medical complexity to ${personality?.medical_expertise_level} level
- Always provide medical disclaimers when giving health advice
- Remember details from this conversation for future reference`

    return prompt
  }

  async processMessage(message: string, conversationHistory: any[] = []): Promise<{
    response: string
    memories: UserAgentMemory[]
    contextTags: string[]
  }> {
    if (!this.context) {
      await this.initializeAgent()
    }

    // Update conversation history
    this.context!.currentSession.conversationHistory = conversationHistory

    // Extract context tags from the message for memory relevance
    const contextTags = this.extractContextTags(message)
    this.context!.currentSession.contextTags = contextTags

    // Get relevant memories for this conversation
    const relevantMemories = await userAgentProfileManager.getRelevantMemories(
      this.userId, 
      contextTags, 
      5
    )

    // Generate personalized response
    const systemPrompt = this.generatePersonalizedSystemPrompt()
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 1000
    })

    const response = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

    // Store important elements as memories
    await this.storeConversationMemories(message, response, contextTags)

    return {
      response,
      memories: relevantMemories,
      contextTags
    }
  }

  private extractContextTags(message: string): string[] {
    const tags: string[] = []
    const lowercaseMessage = message.toLowerCase()

    // Health categories
    if (lowercaseMessage.includes('medication') || lowercaseMessage.includes('pill') || lowercaseMessage.includes('drug')) {
      tags.push('medication')
    }
    if (lowercaseMessage.includes('exercise') || lowercaseMessage.includes('workout') || lowercaseMessage.includes('fitness')) {
      tags.push('fitness')
    }
    if (lowercaseMessage.includes('sleep') || lowercaseMessage.includes('rest') || lowercaseMessage.includes('tired')) {
      tags.push('sleep')
    }
    if (lowercaseMessage.includes('diet') || lowercaseMessage.includes('food') || lowercaseMessage.includes('nutrition')) {
      tags.push('nutrition')
    }
    if (lowercaseMessage.includes('stress') || lowercaseMessage.includes('anxiety') || lowercaseMessage.includes('mental')) {
      tags.push('mental_health')
    }
    if (lowercaseMessage.includes('goal') || lowercaseMessage.includes('target') || lowercaseMessage.includes('objective')) {
      tags.push('goals')
    }

    return tags
  }

  private async storeConversationMemories(userMessage: string, agentResponse: string, contextTags: string[]): Promise<void> {
    // Store user preferences or concerns
    if (userMessage.toLowerCase().includes('prefer') || userMessage.toLowerCase().includes('like') || userMessage.toLowerCase().includes('hate')) {
      await userAgentProfileManager.addMemory(this.userId, {
        memory_type: 'preference',
        content: `User expressed: ${userMessage}`,
        importance_score: 7,
        context_tags: contextTags
      })
    }

    // Store concerns or symptoms
    if (userMessage.toLowerCase().includes('worried') || userMessage.toLowerCase().includes('concern') || userMessage.toLowerCase().includes('pain')) {
      await userAgentProfileManager.addMemory(this.userId, {
        memory_type: 'concern',
        content: `User concern: ${userMessage}`,
        importance_score: 8,
        context_tags: contextTags
      })
    }

    // Store successes or improvements
    if (userMessage.toLowerCase().includes('better') || userMessage.toLowerCase().includes('improved') || userMessage.toLowerCase().includes('success')) {
      await userAgentProfileManager.addMemory(this.userId, {
        memory_type: 'success',
        content: `User success: ${userMessage}`,
        importance_score: 6,
        context_tags: contextTags
      })
    }
  }

  // Goal management methods
  async addUserGoal(goal: {
    goal_type: string
    title: string
    description: string
    target_value?: number
    target_unit?: string
    target_date?: string
    priority: 'low' | 'medium' | 'high'
  }): Promise<void> {
    await userAgentProfileManager.createUserGoal(this.userId, {
      ...goal,
      is_active: true
    } as any)
    
    // Refresh context
    await this.initializeAgent()
  }

  async updatePersonality(updates: Partial<UserAgentPersonality>): Promise<void> {
    await userAgentProfileManager.createOrUpdateAgentPersonality(this.userId, updates)
    
    // Refresh context
    await this.initializeAgent()
  }

  getAgentSummary(): string {
    if (!this.context) {
      return 'Agent not initialized'
    }

    const { personality, goals, memories, healthData } = this.context
    
    return `Personal AI Agent for User ${this.userId}:
- Communication: ${personality?.communication_style}
- Focus Areas: ${personality?.focus_areas?.join(', ')}
- Active Goals: ${goals.length}
- Stored Memories: ${memories.length}
- Health Data: ${healthData ? 'Available' : 'Not available'}`
  }
}

export async function createPersonalAgent(userId: string): Promise<PersonalAIAgent> {
  const agent = new PersonalAIAgent(userId)
  await agent.initializeAgent()
  return agent
}