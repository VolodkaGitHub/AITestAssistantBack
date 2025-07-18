// Terra Database Initialization API Endpoint
import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import TerraDataBaseSetup from '../../lib/terra-database-setup'

interface InitializationResponse {
  success: boolean
  message: string
  components_initialized?: string[]
  error?: string
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<InitializationResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed. Use POST to initialize database.' 
    })
  }

  try {
    console.log('🚀 Starting Terra database initialization...')
    
    // Initialize complete Terra database infrastructure
    await TerraDataBaseSetup.initializeComplete()
    
    const components = [
      'Enhanced connection pool (50 connections)',
      'Comprehensive wearable_connections table',
      'Terra providers registry (90+ devices)',
      'Enhanced health data storage',
      'Webhook event tracking',
      'Data sync monitoring',
      'Enhanced daily summaries',
      'Rate limiting infrastructure',
      'Performance indexes (GIN/BTREE)',
      'Connection pool validation'
    ]

    console.log('✅ Terra database initialization completed successfully')

    return res.status(200).json({
      success: true,
      message: 'Terra database infrastructure initialized successfully',
      components_initialized: components
    })

  } catch (error) {
    console.error('❌ Terra database initialization failed:', error)
    
    return res.status(500).json({
      success: false,
      message: 'Failed to initialize Terra database infrastructure',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}