// API endpoint for deleting scheduled prompts
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'
import { AuthDatabase } from '../../lib/auth-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { promptId } = req.query
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

    if (!promptId) {
      return res.status(400).json({ error: 'Missing prompt ID' })
    }

    const client = await DatabasePool.getClient()

    // Check if prompt exists and belongs to user
    const existingPromptResult = await client.query(
      'SELECT id, prompt_name FROM scheduled_prompts WHERE id = $1 AND user_id = $2',
      [promptId, userSession.id]
    )

    if (existingPromptResult.rows.length === 0) {
      client.release()
      return res.status(404).json({ error: 'Prompt not found or access denied' })
    }

    const promptName = existingPromptResult.rows[0].prompt_name

    // Delete the scheduled prompt
    const deleteResult = await client.query(
      'DELETE FROM scheduled_prompts WHERE id = $1 AND user_id = $2',
      [promptId, userSession.id]
    )

    // Also delete any related prompt executions
    await client.query(
      'DELETE FROM prompt_executions WHERE prompt_id = $1',
      [promptId]
    )

    client.release()

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Failed to delete prompt' })
    }

    res.status(200).json({
      success: true,
      message: `Scheduled prompt "${promptName}" deleted successfully`,
      promptId
    })

  } catch (error: any) {
    console.error('Error deleting scheduled prompt:', error)
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