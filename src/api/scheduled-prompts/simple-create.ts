// API endpoint for creating scheduled prompts
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'
import { AuthDatabase } from '../../lib/auth-database'

/**
 * @openapi
 * /api/scheduled-prompts/simple-create:
 *   post:
 *     tags:
 *       - ScheduledPrompts
 *     summary: Create a new scheduled prompt
 *     description: Creates a scheduled prompt for the authenticated user with specified scheduling and data options.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - prompt_text
 *               - schedule_type
 *             properties:
 *               title:
 *                 type: string
 *                 description: The name/title of the scheduled prompt
 *                 example: "Weekly Health Summary"
 *               prompt_text:
 *                 type: string
 *                 description: The prompt text to send to the AI
 *                 example: "Analyze my weekly health data and provide insights."
 *               promptText:
 *                 type: string
 *                 description: Alternative naming for prompt_text
 *               schedule_type:
 *                 type: string
 *                 description: Scheduling type (e.g., 'daily', 'weekly', 'monthly')
 *                 example: "weekly"
 *               scheduleType:
 *                 type: string
 *                 description: Alternative naming for schedule_type
 *               scheduled_time:
 *                 type: string
 *                 format: date-time
 *                 description: Optional scheduled time for the prompt execution
 *                 example: "2025-07-25T09:00:00Z"
 *               mentioned_data_types:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of data types to include (e.g., vitals, lab_results)
 *                 example: ["vitals", "lab_results"]
 *               includeData:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Alternative naming for mentioned_data_types
 *               email_delivery:
 *                 type: boolean
 *                 description: Whether to send prompt results by email
 *                 default: false
 *               emailDelivery:
 *                 type: boolean
 *                 description: Alternative naming for email_delivery
 *     responses:
 *       201:
 *         description: Scheduled prompt created successfully
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
 *                   example: "Scheduled prompt created successfully"
 *                 promptId:
 *                   type: string
 *                   example: "1234abcd"
 *                 prompt:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "1234abcd"
 *                     title:
 *                       type: string
 *                       example: "Weekly Health Summary"
 *                     prompt_text:
 *                       type: string
 *                       example: "Analyze my weekly health data and provide insights."
 *                     schedule_type:
 *                       type: string
 *                       example: "weekly"
 *                     scheduled_time:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: "2025-07-25T09:00:00Z"
 *                     mentioned_data_types:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["vitals", "lab_results"]
 *                     email_delivery:
 *                       type: boolean
 *                       example: false
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-07-21T14:48:00Z"
 *       400:
 *         description: Missing required fields in the request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized due to missing or invalid token
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
 *         description: Internal server error while creating the prompt
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
 *           example: "Missing required fields: title, promptText, scheduleType"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2025-07-21T14:48:00Z"
 */

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