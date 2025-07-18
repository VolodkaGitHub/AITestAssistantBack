import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { EnhancedVectorSearch } from '../../lib/enhanced-vector-search'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { query, sdco_id, limit = 5, body_system, content_types } = req.body

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query parameter required' })
  }

  try {
    console.log(`Performing enhanced vector search for: "${query}"`)
    
    const vectorSearch = new EnhancedVectorSearch(process.env.DATABASE_URL!)
    
    // Get comprehensive SDCO document search results
    const searchResults = await vectorSearch.searchSDCODocuments(
      query,
      limit,
      body_system,
      content_types
    )
    
    // Get contextual information for OpenAI integration
    const contextualInfo = await vectorSearch.getContextualSDCOInformation(
      query,
      sdco_id,
      2000 // Max tokens for context
    )
    
    console.log(`Found ${searchResults.length} relevant SDCO documents`)
    
    return res.status(200).json({
      success: true,
      results: searchResults,
      contextual_information: contextualInfo,
      search_metadata: {
        query,
        sdco_id,
        body_system,
        result_count: searchResults.length,
        timestamp: new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('Error in enhanced vector search:', error)
    return res.status(500).json({
      success: false,
      error: 'Vector search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}