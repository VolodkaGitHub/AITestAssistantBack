// API endpoint for creating scheduled prompts
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'
import { AuthDatabase } from '../../lib/auth-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      title,
      prompt_text,
      promptText, // Support both naming conventions
      schedule_type,
      scheduleType, // Support both naming conventions
      scheduled_time,
      mentioned_data_types = [],
      includeData = [], // Support both naming conventions
      email_delivery = false,
      emailDelivery // Support both naming conventions
    } = req.body

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

    // Use flexible field mapping
    const finalPromptText = prompt_text || promptText
    const finalScheduleType = schedule_type || scheduleType
    const finalMentionedData = mentioned_data_types.length > 0 ? mentioned_data_types : includeData
    const finalEmailDelivery = email_delivery !== undefined ? email_delivery : emailDelivery

    // Validate required fields
    if (!title || !finalPromptText || !finalScheduleType) {
      return res.status(400).json({
        error: 'Missing required fields: title, promptText/prompt_text, scheduleType/schedule_type'
      })
    }

    const client = await DatabasePool.getClient()

    // Insert scheduled prompt using correct column names
    const result = await client.query(`
      INSERT INTO scheduled_prompts (
        user_id, prompt_name, prompt_text, schedule_type, 
        data_types, email_delivery
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `, [
      userSession.id,
      title,
      finalPromptText,
      finalScheduleType,
      finalMentionedData, // data_types is ARRAY, no JSON.stringify needed
      finalEmailDelivery
    ])

    client.release()

    res.status(201).json({
      success: true,
      message: 'Scheduled prompt created successfully',
      promptId: result.rows[0].id, // E2E test expects this field
      prompt: {
        id: result.rows[0].id,
        title,
        prompt_text: finalPromptText,
        schedule_type: finalScheduleType,
        scheduled_time,
        mentioned_data_types: finalMentionedData,
        email_delivery: finalEmailDelivery,
        created_at: result.rows[0].created_at
      }
    })

  } catch (error: any) {
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