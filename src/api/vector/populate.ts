import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { EnhancedVectorSearch } from '../../lib/enhanced-vector-search'

/**
 * @openapi
 * /api/vector/populate:
 *   post:
 *     tags:
 *       - Vector
 *     summary: Populate enhanced SDCO vector search system
 *     description: Initializes database and populates SDCO documents for vector search.
 *     responses:
 *       200:
 *         description: Vector search system populated successfully
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
 *                   example: Enhanced vector search system populated successfully
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: '2025-07-21T14:00:00Z'
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Failed to populate enhanced vector search system
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Failed to populate enhanced vector search system
 *                 details:
 *                   type: string
 *                   example: Unknown error
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Starting enhanced SDCO vector search population...')
    
    // Initialize enhanced vector search system
    const vectorSearch = new EnhancedVectorSearch(process.env.DATABASE_URL!)
    
    // Initialize database schema
    await vectorSearch.initializeEnhancedSDCOStorage()
    console.log('Database schema initialized')
    
    // Get JWT token for GLM API access using existing authentication
    const jwtResponse = await fetch(`${process.env.NEXTAUTH_URL || 'https://treatmentglm.replit.app'}/api/auth/jwt`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (!jwtResponse.ok) {
      throw new Error('Failed to obtain JWT token for GLM API access')
    }
    
    const jwtData = await jwtResponse.json()
    const jwtToken = jwtData.token
    
    if (!jwtToken) {
      throw new Error('No JWT token returned from authentication service')
    }
    
    // Populate enhanced SDCO documents with comprehensive content
    await vectorSearch.populateEnhancedSDCODocuments(jwtToken)
    console.log('Enhanced SDCO documents populated successfully')
    
    return res.status(200).json({
      success: true,
      message: 'Enhanced vector search system populated successfully',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Error populating enhanced vector search:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to populate enhanced vector search system',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}