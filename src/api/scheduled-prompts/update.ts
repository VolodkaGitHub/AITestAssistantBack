// API endpoint for updating scheduled prompts
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'
import { AuthDatabase } from '../../lib/auth-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { promptId, title, prompt_text, mentioned_data_types, schedule_type, scheduled_time, email_delivery } = req.body
    const sessionToken = req.headers.authorization?.replace('Bearer ', '')

    if (!sessionToken) {
      return res.status(401).json({ error: 'No session token provided' })
    }

    // Validate user session
    const authDb = new AuthDatabase()
    const userSession = await authDb.validateSessionToken(sessionToken)
    if (!userSession) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    if (!promptId || !title || !prompt_text) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const client = await DatabasePool.getClient()

    // Check if prompt exists and belongs to user
    const existingPromptResult = await client.query(
      'SELECT id FROM scheduled_prompts WHERE id = $1 AND user_id = $2',
      [promptId, userSession.id]
    )

    if (existingPromptResult.rows.length === 0) {
      client.release()
      return res.status(404).json({ error: 'Prompt not found or access denied' })
    }

    // Update the scheduled prompt
    const result = await client.query(`
      UPDATE scheduled_prompts 
      SET 
        prompt_name = $1,
        prompt_text = $2,
        data_types = $3,
        schedule_type = $4,
        schedule_time = $5,
        email_delivery = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND user_id = $8
      RETURNING *
    `, [
      title,
      prompt_text,
      mentioned_data_types,
      schedule_type,
      scheduled_time || null,
      email_delivery || false,
      promptId,
      userSession.id
    ])

    client.release()

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Failed to update prompt' })
    }

    const updatedPrompt = result.rows[0]

    res.status(200).json({
      success: true,
      message: 'Scheduled prompt updated successfully',
      prompt: {
        id: updatedPrompt.id,
        title: updatedPrompt.prompt_name,
        prompt_text: updatedPrompt.prompt_text,
        mentioned_data_types: updatedPrompt.data_types,
        schedule_type: updatedPrompt.schedule_type,
        scheduled_time: updatedPrompt.schedule_time,
        email_delivery: updatedPrompt.email_delivery,
        active: updatedPrompt.is_active,
        updated_at: updatedPrompt.updated_at
      }
    })

  } catch (error: any) {
    console.error('Error updating scheduled prompt:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}