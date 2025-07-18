import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Create user_conditions table if it doesn't exist
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_conditions (
        id SERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        condition_id VARCHAR(255) NOT NULL,
        display_name VARCHAR(500) NOT NULL,
        added_date TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_email, condition_id)
      )
    `)

    // Create indexes for better performance
    await dbPool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_conditions_email 
      ON user_conditions(user_email)
    `)

    await dbPool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_conditions_condition_id 
      ON user_conditions(condition_id)
    `)

    return res.status(200).json({ 
      message: 'User conditions database initialized successfully' 
    })
  } catch (error) {
    console.error('Database initialization error:', error)
    return res.status(500).json({ 
      error: 'Failed to initialize database' 
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}