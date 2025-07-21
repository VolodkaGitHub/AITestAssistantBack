// API endpoint for deleting scheduled prompts
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'
import { AuthDatabase } from '../../lib/auth-database'

/**
 * @openapi
 * /api/scheduled-prompts/delete:
 *   delete:
 *     tags:
 *       - ScheduledPrompts
 *     summary: Delete a scheduled prompt by ID
 *     description: Deletes a scheduled prompt owned by the authenticated user, along with related prompt executions.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: promptId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the scheduled prompt to delete
 *     responses:
 *       200:
 *         description: Scheduled prompt deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Scheduled prompt "Morning Reminder" deleted successfully
 *                 promptId:
 *                   type: string
 *                   example: "1234abcd"
 *       400:
 *         description: Missing prompt ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized — no or invalid session token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Prompt not found or access denied / Failed to delete prompt
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "Invalid session token"
 *         success:
 *           type: boolean
 *           example: false
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2025-07-21T10:00:00Z"
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

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