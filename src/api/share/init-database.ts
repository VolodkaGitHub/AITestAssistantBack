import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

/**
 * @openapi
 * /api/share/init-database:
 *   post:
 *     summary: Initialize the database schema for sharing features
 *     description: Creates tables and indexes needed for sharing chat sessions, email activity logs, user notifications, and sharing activity logs.
 *     tags:
 *       - Share
 *     responses:
 *       200:
 *         description: Sharing database schema initialized successfully
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
 *                   example: Sharing database schema initialized successfully
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
 *         description: Failed to initialize database schema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to initialize database schema
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('🔄 Initializing sharing database schema...')

    // Create email activity log table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS email_activity_log (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        activity_type VARCHAR(100) NOT NULL,
        session_id VARCHAR(255),
        recipient_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      )
    `)

    // Create shared chat sessions table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS shared_chat_sessions (
        id SERIAL PRIMARY KEY,
        share_id VARCHAR(255) UNIQUE NOT NULL,
        sender_email VARCHAR(255) NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        session_id VARCHAR(255),
        title VARCHAR(500) NOT NULL,
        messages JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        viewed_at TIMESTAMP,
        is_viewed BOOLEAN DEFAULT FALSE
      )
    `)

    // Create user notifications table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id SERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        notification_type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP
      )
    `)

    // Create sharing activity log table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS sharing_activity_log (
        id SERIAL PRIMARY KEY,
        sender_email VARCHAR(255) NOT NULL,
        recipient_email VARCHAR(255),
        activity_type VARCHAR(100) NOT NULL,
        share_id VARCHAR(255),
        session_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      )
    `)

    // Create indexes for better performance
    await dbPool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_activity_log_email ON email_activity_log(email);
      CREATE INDEX IF NOT EXISTS idx_shared_chat_sessions_recipient ON shared_chat_sessions(recipient_email);
      CREATE INDEX IF NOT EXISTS idx_shared_chat_sessions_sender ON shared_chat_sessions(sender_email);
      CREATE INDEX IF NOT EXISTS idx_user_notifications_email ON user_notifications(user_email);
      CREATE INDEX IF NOT EXISTS idx_sharing_activity_log_sender ON sharing_activity_log(sender_email);
    `)

    console.log('✅ Sharing database schema initialized successfully')

    res.status(200).json({ 
      success: true, 
      message: 'Sharing database schema initialized successfully' 
    })

  } catch (error) {
    console.error('❌ Error initializing sharing database schema:', error)
    res.status(500).json({ error: 'Failed to initialize database schema' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}