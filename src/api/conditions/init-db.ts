import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

/**
 * @openapi
 * /api/conditions/init-db:
 *   post:
 *     summary: Initialize the user_conditions table and indexes
 *     description: Creates the `user_conditions` table and indexes if they do not exist.
 *     tags:
 *       - Conditions
 *     requestBody:
 *       required: false
 *     responses:
 *       200:
 *         description: Table and indexes created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User conditions database initialized successfully
 *       405:
 *         description: Method Not Allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Failed to initialize database
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to initialize database
 */

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