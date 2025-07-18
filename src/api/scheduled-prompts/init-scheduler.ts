// API endpoint to initialize and start the prompt scheduler
import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { startScheduler, getSchedulerStatus } from '../../lib/prompt-scheduler'
import { initializeScheduledPromptsDatabase } from '../../lib/scheduled-prompts-database'

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