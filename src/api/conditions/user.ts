import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

interface UserCondition {
  id: string
  display_name: string
  added_date: string
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { method } = req
  
  try {
    // Extract user from session token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const sessionToken = authHeader.split(' ')[1]
    
    // Get user from session - using the correct session table structure
    const userQuery = 'SELECT user_id FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()'
    const userResult = await dbPool.query(userQuery, [sessionToken])
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const userId = userResult.rows[0].user_id

    switch (method) {
      case 'GET':
        // Get user's conditions with display names from conditions_library
        const getResult = await dbPool.query(`
          SELECT 
            uc.condition_id as id, 
            cl.display_name, 
            uc.created_at as added_date,
            uc.severity,
            uc.notes,
            uc.is_active
          FROM user_conditions uc
          LEFT JOIN conditions_library cl ON uc.condition_id::text = cl.id
          WHERE uc.user_id = $1 AND uc.is_active = true
          ORDER BY uc.created_at DESC
        `, [userId])
        
        return res.status(200).json({ 
          conditions: getResult.rows.map(row => ({
            id: row.id,
            display_name: row.display_name || 'Unknown Condition',
            added_date: row.added_date,
            severity: row.severity,
            notes: row.notes
          }))
        })

      case 'POST':
        // Add condition
        const { conditionId, displayName } = req.body
        
        if (!conditionId) {
          return res.status(400).json({ error: 'conditionId is required' })
        }

        // Check if condition already exists for user
        const existingCondition = await dbPool.query(
          'SELECT id FROM user_conditions WHERE user_id = $1 AND condition_id = $2 AND is_active = true',
          [userId, conditionId]
        )

        if (existingCondition.rows.length > 0) {
          return res.status(409).json({ error: 'Condition already exists for user' })
        }

        // Insert new condition using the actual schema
        await dbPool.query(`
          INSERT INTO user_conditions (user_id, condition_id, is_active, created_at) 
          VALUES ($1, $2, true, NOW())
        `, [userId, conditionId])

        return res.status(201).json({ message: 'Condition added successfully' })

      case 'DELETE':
        // Remove condition (soft delete by setting is_active = false)
        const { conditionId: deleteConditionId } = req.body
        
        if (!deleteConditionId) {
          return res.status(400).json({ error: 'conditionId is required' })
        }

        const deleteResult = await dbPool.query(
          'UPDATE user_conditions SET is_active = false WHERE user_id = $1 AND condition_id = $2',
          [userId, deleteConditionId]
        )

        if (deleteResult.rowCount === 0) {
          return res.status(404).json({ error: 'Condition not found for user' })
        }

        return res.status(200).json({ message: 'Condition removed successfully' })

      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Database error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}