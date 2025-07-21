// API endpoint to initialize and start the prompt scheduler
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { startScheduler, getSchedulerStatus } from '../../lib/prompt-scheduler'
import { initializeScheduledPromptsDatabase } from '../../lib/scheduled-prompts-database'

/**
 * @openapi
 * /api/scheduled-prompts/init-scheduler:
 *   get:
 *     tags:
 *       - ScheduledPrompts
 *     summary: Get the current status of the prompt scheduler
 *     description: Returns the current status information of the scheduled prompts scheduler.
 *     responses:
 *       200:
 *         description: Scheduler status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 scheduler:
 *                   type: object
 *                   description: Scheduler status details
 *                   example: { running: true, intervalMinutes: 5, lastRun: "2025-07-21T10:00:00Z" }
 *       500:
 *         description: Failed to get scheduler status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     tags:
 *       - ScheduledPrompts
 *     summary: Initialize and start the prompt scheduler
 *     description: Initializes the scheduled prompts database and starts the scheduler with the specified interval.
 *     responses:
 *       200:
 *         description: Scheduler initialized and started successfully
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
 *                   example: Scheduled prompts system initialized and scheduler started
 *                 scheduler:
 *                   type: object
 *                   description: Scheduler status details after initialization
 *                   example: { running: true, intervalMinutes: 5, lastRun: "2025-07-21T10:00:00Z" }
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to initialize scheduler
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
 *           example: "Failed to initialize scheduler"
 *         details:
 *           type: string
 *           example: "Error message details"
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Get scheduler status
    try {
      const status = getSchedulerStatus()
      res.status(200).json({
        success: true,
        scheduler: status
      })
    } catch (error) {
      console.error('❌ Error getting scheduler status:', error)
      res.status(500).json({ 
        error: 'Failed to get scheduler status',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  } else if (req.method === 'POST') {
    // Initialize database and start scheduler
    try {
      console.log('🚀 Initializing scheduled prompts system...')
      
      // Initialize database schema
      await initializeScheduledPromptsDatabase()
      
      // Start the scheduler with 5-minute intervals
      startScheduler(5)
      
      const status = getSchedulerStatus()
      
      console.log('✅ Scheduled prompts system initialized successfully')
      
      res.status(200).json({
        success: true,
        message: 'Scheduled prompts system initialized and scheduler started',
        scheduler: status
      })
      
    } catch (error) {
      console.error('❌ Error initializing scheduler:', error)
      res.status(500).json({ 
        error: 'Failed to initialize scheduler',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}