import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

interface ChatMessage {
  id: string
  content: string
  sender: 'user' | 'assistant'
  timestamp: Date
}

interface InternalShareRequest {
  linkedAccountId: string
  messages: ChatMessage[]
  sessionId?: string
  title: string
}

/**
 * @openapi
 * /api/share/internal-share:
 *   post:
 *     summary: Share a chat session internally with a linked account
 *     description: Shares a Treatment AI chat session with a linked account of the authenticated user, stores the share, creates a notification, and logs the activity.
 *     tags:
 *       - Share
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Details of the linked account, messages, session, and title to share
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - linkedAccountId
 *               - messages
 *               - title
 *             properties:
 *               linkedAccountId:
 *                 type: string
 *                 example: "abc123"
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - content
 *                     - sender
 *                     - timestamp
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "msg1"
 *                     content:
 *                       type: string
 *                       example: "Hello, how can I help you?"
 *                     sender:
 *                       type: string
 *                       enum: [user, assistant]
 *                       example: "user"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-07-21T14:30:00Z"
 *               sessionId:
 *                 type: string
 *                 nullable: true
 *                 example: "session789"
 *               title:
 *                 type: string
 *                 example: "Consultation on treatment plan"
 *     responses:
 *       200:
 *         description: Chat session shared successfully
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
 *                   example: Chat session shared successfully
 *                 shareId:
 *                   type: string
 *                   example: share_1626874839203_abcd1234
 *                 recipientEmail:
 *                   type: string
 *                   example: linkeduser@example.com
 *       400:
 *         description: Bad request - missing required fields or invalid data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Linked account ID and messages are required
 *       401:
 *         description: Unauthorized - authentication required or invalid session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Authentication required
 *       404:
 *         description: Linked account not found or does not belong to user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Linked account not found
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error - failed to share chat session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to share chat session
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { linkedAccountId, messages, sessionId, title }: InternalShareRequest = req.body

    if (!linkedAccountId || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Linked account ID and messages are required' })
    }

    // Get current user info
    const sessionToken = req.headers.authorization?.replace('Bearer ', '')
    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    // Validate session and get user
    const userResult = await dbPool.query(
      'SELECT user_email FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()',
      [sessionToken]
    )

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const userEmail = userResult.rows[0].user_email

    // Verify the linked account exists and belongs to the current user
    const linkedAccountResult = await dbPool.query(
      'SELECT * FROM linked_accounts WHERE id = $1 AND user_email = $2',
      [linkedAccountId, userEmail]
    )

    if (linkedAccountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Linked account not found' })
    }

    const linkedAccount = linkedAccountResult.rows[0]
    const recipientEmail = linkedAccount.linked_user_email

    // Create the shared session record
    const shareId = `share_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
    
    await dbPool.query(
      `INSERT INTO shared_chat_sessions 
       (share_id, sender_email, recipient_email, session_id, title, messages, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        shareId,
        userEmail,
        recipientEmail,
        sessionId || null,
        title,
        JSON.stringify(messages),
        new Date(),
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      ]
    )

    // Create notification for the recipient
    await dbPool.query(
      `INSERT INTO user_notifications 
       (user_email, notification_type, title, message, metadata, created_at, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        recipientEmail,
        'chat_shared',
        'New Chat Session Shared',
        `${userEmail} has shared a Treatment AI chat session with you: "${title}"`,
        JSON.stringify({ shareId, senderEmail: userEmail, sessionId }),
        new Date(),
        false
      ]
    )

    // Log the sharing activity
    await dbPool.query(
      'INSERT INTO sharing_activity_log (sender_email, recipient_email, activity_type, share_id, session_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [userEmail, recipientEmail, 'chat_share_internal', shareId, sessionId || null, new Date()]
    )

    res.status(200).json({ 
      success: true, 
      message: 'Chat session shared successfully',
      shareId: shareId,
      recipientEmail: recipientEmail
    })

  } catch (error) {
    console.error('Error sharing chat:', error)
    res.status(500).json({ error: 'Failed to share chat session' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}