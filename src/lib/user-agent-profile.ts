import { DatabasePool } from './database-pool';

export interface UserGoal {
  id: string
  user_id: string
  goal_type: 'weight_loss' | 'fitness' | 'sleep_improvement' | 'stress_management' | 'chronic_condition' | 'preventive_care' | 'nutrition' | 'custom'
  title: string
  description: string
  target_value?: number
  target_unit?: string
  target_date?: string
  current_value?: number
  priority: 'low' | 'medium' | 'high'
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface UserAgentPersonality {
  id: string
  user_id: string
  communication_style: 'professional' | 'friendly' | 'motivational' | 'direct' | 'empathetic'
  medical_expertise_level: 'basic' | 'intermediate' | 'advanced'
  focus_areas: string[] // ['nutrition', 'fitness', 'mental_health', 'chronic_conditions']
  preferred_language: string
  reminder_frequency: 'daily' | 'weekly' | 'monthly' | 'as_needed'
  proactive_suggestions: boolean
  privacy_level: 'open' | 'moderate' | 'private'
  created_at: Date
  updated_at: Date
}

export interface UserAgentMemory {
  id: string
  user_id: string
  memory_type: 'preference' | 'concern' | 'success' | 'challenge' | 'milestone'
  content: string
  importance_score: number // 1-10
  context_tags: string[]
  created_at: Date
  last_referenced: Date
}

export class UserAgentProfileManager {
  private static instance: UserAgentProfileManager
  private dbPool: DatabasePool

  private constructor() {
    this.dbPool = DatabasePool.getInstance()
  }

  public static getInstance(): UserAgentProfileManager {
    if (!UserAgentProfileManager.instance) {
      UserAgentProfileManager.instance = new UserAgentProfileManager()
    }
    return UserAgentProfileManager.instance
  }

  async initializeSchema(): Promise<void> {
    const client = await DatabasePool.getClient()
    
    try {
      // User Goals table
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_goals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL,
          goal_type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          target_value DECIMAL,
          target_unit VARCHAR(50),
          target_date DATE,
          current_value DECIMAL,
          priority VARCHAR(20) DEFAULT 'medium',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // User Agent Personality table
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_agent_personality (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) UNIQUE NOT NULL,
          communication_style VARCHAR(50) DEFAULT 'friendly',
          medical_expertise_level VARCHAR(20) DEFAULT 'basic',
          focus_areas JSONB DEFAULT '[]',
          preferred_language VARCHAR(10) DEFAULT 'en',
          reminder_frequency VARCHAR(20) DEFAULT 'weekly',
          proactive_suggestions BOOLEAN DEFAULT true,
          privacy_level VARCHAR(20) DEFAULT 'moderate',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // User Agent Memory table
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_agent_memory (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL,
          memory_type VARCHAR(50) NOT NULL,
          content TEXT NOT NULL,
          importance_score INTEGER DEFAULT 5,
          context_tags JSONB DEFAULT '[]',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_referenced TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_goals_active ON user_goals(user_id, is_active);
        CREATE INDEX IF NOT EXISTS idx_agent_memory_user_id ON user_agent_memory(user_id);
        CREATE INDEX IF NOT EXISTS idx_agent_memory_importance ON user_agent_memory(user_id, importance_score DESC);
      `)

      console.log('✅ User Agent Profile schema initialized')
    } finally {
      client.release()
    }
  }

  // Goal Management
  async createUserGoal(userId: string, goal: Omit<UserGoal, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<UserGoal> {
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        INSERT INTO user_goals (user_id, goal_type, title, description, target_value, target_unit, target_date, current_value, priority, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [userId, goal.goal_type, goal.title, goal.description, goal.target_value, goal.target_unit, goal.target_date, goal.current_value, goal.priority, goal.is_active])

      return result.rows[0]
    } finally {
      client.release()
    }
  }

  async getUserGoals(userId: string, activeOnly: boolean = true): Promise<UserGoal[]> {
    const client = await DatabasePool.getClient()
    
    try {
      const query = activeOnly 
        ? 'SELECT * FROM user_goals WHERE user_id = $1 AND is_active = true ORDER BY priority DESC, created_at DESC'
        : 'SELECT * FROM user_goals WHERE user_id = $1 ORDER BY created_at DESC'
      
      const result = await client.query(query, [userId])
      return result.rows
    } finally {
      client.release()
    }
  }

  // Agent Personality Management
  async createOrUpdateAgentPersonality(userId: string, personality: Partial<UserAgentPersonality>): Promise<UserAgentPersonality> {
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        INSERT INTO user_agent_personality (user_id, communication_style, medical_expertise_level, focus_areas, preferred_language, reminder_frequency, proactive_suggestions, privacy_level)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          communication_style = COALESCE($2, user_agent_personality.communication_style),
          medical_expertise_level = COALESCE($3, user_agent_personality.medical_expertise_level),
          focus_areas = COALESCE($4, user_agent_personality.focus_areas),
          preferred_language = COALESCE($5, user_agent_personality.preferred_language),
          reminder_frequency = COALESCE($6, user_agent_personality.reminder_frequency),
          proactive_suggestions = COALESCE($7, user_agent_personality.proactive_suggestions),
          privacy_level = COALESCE($8, user_agent_personality.privacy_level),
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [
        userId, 
        personality.communication_style, 
        personality.medical_expertise_level, 
        JSON.stringify(personality.focus_areas), 
        personality.preferred_language, 
        personality.reminder_frequency, 
        personality.proactive_suggestions, 
        personality.privacy_level
      ])

      return result.rows[0]
    } finally {
      client.release()
    }
  }

  async getAgentPersonality(userId: string): Promise<UserAgentPersonality | null> {
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query('SELECT * FROM user_agent_personality WHERE user_id = $1', [userId])
      return result.rows[0] || null
    } finally {
      client.release()
    }
  }

  // Memory Management
  async addMemory(userId: string, memory: Omit<UserAgentMemory, 'id' | 'user_id' | 'created_at' | 'last_referenced'>): Promise<UserAgentMemory> {
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        INSERT INTO user_agent_memory (user_id, memory_type, content, importance_score, context_tags)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [userId, memory.memory_type, memory.content, memory.importance_score, JSON.stringify(memory.context_tags)])

      return result.rows[0]
    } finally {
      client.release()
    }
  }

  async getRelevantMemories(userId: string, contextTags: string[] = [], limit: number = 10): Promise<UserAgentMemory[]> {
    const client = await DatabasePool.getClient()
    
    try {
      let query = `
        SELECT * FROM user_agent_memory 
        WHERE user_id = $1
      `
      const params: any[] = [userId]

      if (contextTags.length > 0) {
        query += ` AND context_tags ?| $2`
        params.push(contextTags)
      }

      query += ` ORDER BY importance_score DESC, last_referenced DESC LIMIT $${params.length + 1}`
      params.push(limit)

      const result = await client.query(query, params)
      
      // Update last_referenced for retrieved memories
      if (result.rows.length > 0) {
        const memoryIds = result.rows.map(row => row.id)
        await client.query(`
          UPDATE user_agent_memory 
          SET last_referenced = CURRENT_TIMESTAMP 
          WHERE id = ANY($1)
        `, [memoryIds])
      }

      return result.rows
    } finally {
      client.release()
    }
  }

  // Comprehensive Agent Profile
  async getComprehensiveAgentProfile(userId: string): Promise<{
    personality: UserAgentPersonality | null
    goals: UserGoal[]
    recentMemories: UserAgentMemory[]
  }> {
    const [personality, goals, memories] = await Promise.all([
      this.getAgentPersonality(userId),
      this.getUserGoals(userId),
      this.getRelevantMemories(userId, [], 20)
    ])

    return {
      personality,
      goals,
      recentMemories: memories
    }
  }
}

export const userAgentProfileManager = UserAgentProfileManager.getInstance()