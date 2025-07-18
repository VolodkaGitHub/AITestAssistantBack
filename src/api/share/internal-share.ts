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