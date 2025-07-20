import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

/**
 * @openapi
 * /api/health/timeline:
 *   get:
 *     tags:
 *       - Health
 *     summary: Get health timeline entries
 *     description: Fetches the authenticated user's health timeline entries with details and stats.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Timeline entries fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timeline:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       userId:
 *                         type: integer
 *                       sessionId:
 *                         type: string
 *                       date:
 *                         type: string
 *                         format: date
 *                       symptoms:
 *                         type: array
 *                         items:
 *                           type: string
 *                       findings:
 *                         type: string
 *                       topDifferentialDiagnoses:
 *                         type: array
 *                         items:
 *                           type: object
 *                       chatSummary:
 *                         type: string
 *                       fullChatHistory:
 *                         type: array
 *                         items:
 *                           type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalEntries:
 *                       type: integer
 *                     lastEntry:
 *                       type: string
 *                       format: date
 *                       nullable: true
 *       401:
 *         description: Unauthorized - invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Server error fetching timeline
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 * 
 *   delete:
 *     tags:
 *       - Health
 *     summary: Delete a health timeline entry
 *     description: Deletes a specified timeline entry for the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entryId
 *             properties:
 *               entryId:
 *                 type: integer
 *                 description: ID of the timeline entry to delete
 *     responses:
 *       200:
 *         description: Timeline entry deleted successfully
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
 *                   example: Timeline entry deleted successfully
 *       400:
 *         description: Bad request - missing entryId
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Entry ID is required
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       404:
 *         description: Timeline entry not found or access denied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Timeline entry not found or access denied
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Server error deleting timeline entry
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return handleGetTimeline(req, res)
  } else if (req.method === 'DELETE') {
    return handleDeleteEntry(req, res)
  } else {
    return res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleGetTimeline(req: NextApiRequest, res: NextApiResponse) {

  try {
    // Extract user from session token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const sessionToken = authHeader.split(' ')[1]
    
    // Get user from session
    const userQuery = 'SELECT user_id FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()'
    const userResult = await dbPool.query(userQuery, [sessionToken])
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const userId = userResult.rows[0].user_id

    // Fetch health timeline entries for the user
    const timelineQuery = `
      SELECT 
        id,
        user_id as "userId",
        session_id as "sessionId",
        date,
        symptoms,
        findings,
        top_differential_diagnoses as "topDifferentialDiagnoses",
        chat_summary as "chatSummary",
        full_chat_history as "fullChatHistory",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM health_timeline 
      WHERE user_id = $1 
      ORDER BY date DESC, created_at DESC 
      LIMIT 100
    `
    
    const timelineResult = await dbPool.query(timelineQuery, [userId])

    // Parse JSON fields and format data
    const timeline = timelineResult.rows.map(row => ({
      ...row,
      symptoms: typeof row.symptoms === 'string' ? JSON.parse(row.symptoms) : row.symptoms,
      topDifferentialDiagnoses: typeof row.topDifferentialDiagnoses === 'string' 
        ? JSON.parse(row.topDifferentialDiagnoses) 
        : row.topDifferentialDiagnoses,
      fullChatHistory: typeof row.fullChatHistory === 'string' 
        ? JSON.parse(row.fullChatHistory) 
        : row.fullChatHistory
    }))

    // Get timeline stats
    const stats = {
      totalEntries: timeline.length,
      lastEntry: timeline.length > 0 ? timeline[0].date : null
    }

    res.status(200).json({
      timeline,
      stats
    })

  } catch (error) {
    console.error('Error fetching health timeline:', error)
    res.status(500).json({ 
      error: 'Failed to fetch health timeline',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    })
  }
}

async function handleDeleteEntry(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Extract user from session token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const sessionToken = authHeader.split(' ')[1]
    
    // Get user from session
    const userQuery = 'SELECT user_id FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()'
    const userResult = await dbPool.query(userQuery, [sessionToken])
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const userId = userResult.rows[0].user_id
    const { entryId } = req.body

    if (!entryId) {
      return res.status(400).json({ error: 'Entry ID is required' })
    }

    // Delete the timeline entry (ensure it belongs to the user)
    const deleteQuery = `
      DELETE FROM health_timeline 
      WHERE id = $1 AND user_id = $2
    `
    
    const deleteResult = await dbPool.query(deleteQuery, [entryId, userId])
    
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Timeline entry not found or access denied' })
    }

    res.status(200).json({
      success: true,
      message: 'Timeline entry deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting health timeline entry:', error)
    res.status(500).json({ 
      error: 'Failed to delete timeline entry',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}