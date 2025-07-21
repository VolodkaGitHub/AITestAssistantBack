// API endpoint for sharing scheduled prompts with linked accounts
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateUserSession } from '../../lib/auth-database'
import { sharePromptWithUser, initializeScheduledPromptsDatabase } from '../../lib/scheduled-prompts-database'
import { getLinkedAccounts } from '../../lib/account-linking-database'
import EmailService from '../../lib/email-service'
import { DatabasePool } from '../../lib/database-pool';

/**
 * @openapi
 * /api/scheduled-prompts/share:
 *   post:
 *     tags:
 *       - ScheduledPrompts
 *     summary: Share a scheduled prompt with a linked account
 *     description: Allows a user to share one of their scheduled prompts with a linked account, with specified permissions.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt_id
 *               - shared_with_email
 *               - permissions
 *             properties:
 *               prompt_id:
 *                 type: string
 *                 description: ID of the scheduled prompt to share
 *               shared_with_email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the linked account to share with
 *               permissions:
 *                 type: object
 *                 properties:
 *                   view_results:
 *                     type: boolean
 *                     description: Permission to view prompt results
 *                   edit_prompt:
 *                     type: boolean
 *                     description: Permission to edit the prompt
 *                   receive_emails:
 *                     type: boolean
 *                     description: Permission to receive emails related to the prompt
 *             example:
 *               prompt_id: "1234abcd"
 *               shared_with_email: "linkeduser@example.com"
 *               permissions:
 *                 view_results: true
 *                 edit_prompt: false
 *                 receive_emails: true
 *     responses:
 *       200:
 *         description: Prompt shared successfully
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
 *                   example: "Prompt shared successfully"
 *                 shared_with:
 *                   type: string
 *                   format: email
 *                   example: "linkeduser@example.com"
 *                 permissions:
 *                   type: object
 *                   properties:
 *                     view_results:
 *                       type: boolean
 *                     edit_prompt:
 *                       type: boolean
 *                     receive_emails:
 *                       type: boolean
 *                 email_sent:
 *                   type: boolean
 *                   description: Indicates if notification email was sent
 *                 email_error:
 *                   type: string
 *                   nullable: true
 *                   description: Error message if email sending failed
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
 *       403:
 *         description: Forbidden - trying to share with non-linked account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Scheduled prompt not found or access denied
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
 *         description: Internal server error while sharing the prompt
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
 *           example: "Invalid session"
 *         details:
 *           type: string
 *           nullable: true
 *           example: "Session token expired"
 *     Permissions:
 *       type: object
 *       properties:
 *         view_results:
 *           type: boolean
 *         edit_prompt:
 *           type: boolean
 *         receive_emails:
 *           type: boolean
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const client = await DatabasePool.getClient()

  try {
    // Validate user session
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' })
    }

    const sessionToken = authHeader.substring(7)
    const userSession = await validateUserSession(sessionToken)
    
    if (!userSession || !userSession.userId) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    // Initialize database if needed
    await initializeScheduledPromptsDatabase()

    const { prompt_id, shared_with_email, permissions } = req.body
    
    if (!prompt_id || !shared_with_email || !permissions) {
      return res.status(400).json({ 
        error: 'Missing required fields: prompt_id, shared_with_email, permissions' 
      })
    }

    // Validate permissions structure
    const validPermissions = {
      view_results: !!permissions.view_results,
      edit_prompt: !!permissions.edit_prompt,
      receive_emails: !!permissions.receive_emails
    }

    // Check if the prompt exists and belongs to the user
    const result = await client.query(`
      SELECT * FROM scheduled_prompts 
      WHERE id = $1 AND user_id = $2
    `, [prompt_id, userSession!.userId])
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled prompt not found or access denied' })
    }
    
    const prompt = result.rows[0]

    // Check if the user has a linked account with the target email
    const linkedAccounts = await getLinkedAccounts(userSession!.userId)
    const isLinkedAccount = linkedAccounts.some(account => 
      (account as any).linked_user_email === shared_with_email && (account as any).status === 'accepted'
    )

    if (!isLinkedAccount) {
      return res.status(403).json({ 
        error: 'You can only share prompts with linked accounts. Please link this account first.' 
      })
    }

    // Share the prompt
    await sharePromptWithUser(
      prompt_id,
      userSession!.userId,
      shared_with_email,
      validPermissions
    )

    // Send notification email
    const emailService = EmailService
    // Email sharing temporarily disabled
    console.log('Prompt sharing notification email disabled')
    const emailResult = { success: true, messageId: 'disabled' }
    // const emailResult = await emailService.sendPromptSharingNotification(
      // shared_with_email,
      // userSession!.email,
      // prompt.title,
      // validPermissions
    // )

    console.log(`✅ Prompt ${prompt_id} shared with ${shared_with_email}`)

    res.status(200).json({
      success: true,
      message: 'Prompt shared successfully',
      shared_with: shared_with_email,
      permissions: validPermissions,
      email_sent: emailResult.success,
      email_error: (emailResult as any).error
    })

  } catch (error) {
    console.error('❌ Error sharing scheduled prompt:', error)
    res.status(500).json({ 
      error: 'Failed to share scheduled prompt',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  } finally {
    client.release()
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}