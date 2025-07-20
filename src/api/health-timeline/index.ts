import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { healthTimelineDB } from '../../lib/health-timeline-database'
import { authDB } from '../../lib/auth-database'

/**
 * @openapi
 * /api/health-timeline/index:
 *   get:
 *     summary: Get user's health timeline entries
 *     description: Returns the user's health timeline entries with summary statistics.
 *     tags:
 *       - HealthTimeline
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of timeline entries to retrieve
 *     responses:
 *       '200':
 *         description: Timeline entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 timeline:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 123
 *                       date:
 *                         type: string
 *                         format: date
 *                         example: "2025-07-20"
 *                       symptoms:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["headache", "fatigue"]
 *                       findings:
 *                         type: string
 *                         example: "Mild inflammation"
 *                       topDifferentialDiagnoses:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["Migraine", "Tension headache"]
 *                       chatSummary:
 *                         type: string
 *                         example: "Patient reported headache symptoms over past 3 days."
 *                       fullChatHistory:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             message:
 *                               type: string
 *                             timestamp:
 *                               type: string
 *                               format: date-time
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
 *                       example: 10
 *                     lastEntry:
 *                       type: string
 *                       format: date
 *                       example: "2025-07-20"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 42
 *                     firstName:
 *                       type: string
 *                       example: "John"
 *                     lastName:
 *                       type: string
 *                       example: "Doe"
 *       '400':
 *         description: Bad request, e.g., missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Entry ID is required"
 *       '401':
 *         description: Unauthorized - missing or invalid authentication
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       '404':
 *         description: Timeline entry not found for deletion
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Timeline entry not found"
 *       '405':
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 *   delete:
 *     summary: Delete a specific health timeline entry
 *     description: Deletes a health timeline entry by entryId for the authenticated user.
 *     tags:
 *       - HealthTimeline
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: ID of the timeline entry to delete
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
 *                 example: 123
 *     responses:
 *       '200':
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
 *                   example: "Timeline entry deleted successfully"
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize database schema
    await healthTimelineDB.initializeSchema()

    // Get session token from headers
    const sessionToken = req.headers.authorization?.replace('Bearer ', '')
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    // Verify session and get user
    const user = await authDB.validateSession(sessionToken)
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    if (req.method === 'GET') {
      // Get user's health timeline
      const limit = parseInt(req.query.limit as string) || 50
      const timeline = await healthTimelineDB.getUserHealthTimeline(user.id, limit)
      
      // Get timeline stats
      const stats = await healthTimelineDB.getHealthTimelineStats(user.id)

      return res.status(200).json({
        success: true,
        timeline,
        stats,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name
        }
      })
    }

    if (req.method === 'DELETE') {
      // Delete specific timeline entry
      const { entryId } = req.body
      
      if (!entryId) {
        return res.status(400).json({ error: 'Entry ID is required' })
      }

      const deleted = await healthTimelineDB.deleteHealthTimelineEntry(entryId, user.id)
      
      if (!deleted) {
        return res.status(404).json({ error: 'Timeline entry not found' })
      }

      return res.status(200).json({
        success: true,
        message: 'Timeline entry deleted successfully'
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (error) {
    console.error('Health timeline API error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}