import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { FixedVectorSearchManager } from '../../lib/fixed-vector-search-manager'
import { withScalableMiddleware } from '../../lib/api-middleware'

interface SDCOResult {
  sdco_id: string
  display_name: string
  display_name_layman: string
  description?: string
  definition_layman?: string
  categories: string[]
  relevance_score: number
  match_type: string
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { symptom, confidence_threshold = 0.05, limit = 10 } = req.body

    if (!symptom) {
      return res.status(400).json({ error: 'Symptom parameter required' })
    }

    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      return res.status(500).json({ error: 'Database configuration missing' })
    }

    console.log('Enhanced vector search request:', { symptom, confidence_threshold, limit })

    const vectorSearch = new FixedVectorSearchManager(databaseUrl)
    const searchResults = await vectorSearch.searchSymptoms(symptom, limit)
    
    // Convert to expected format and filter by confidence
    const results: SDCOResult[] = searchResults
      .filter((result: any) => result.relevance_score >= confidence_threshold)
      .map((result: any) => ({
        sdco_id: result.sdco_id,
        display_name: result.display_name,
        display_name_layman: result.display_name_layman,
        description: result.matched_content,
        definition_layman: result.body_system,
        categories: [],
        relevance_score: result.relevance_score,
        match_type: 'fixed_942_document_search'
      }))
    
    console.log('Enhanced vector search results:', results.length)
    
    res.status(200).json({
      results,
      search_term: symptom,
      total_results: results.length,
      search_type: 'enhanced_vector_search'
    })
  } catch (error) {
    console.error('Enhanced vector search failed:', error)
    res.status(500).json({ 
      error: 'Enhanced vector search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}



// Export with rate limiting protection  
export default withScalableMiddleware("SYMPTOM_SEARCH", {
  requireSession: false,
  requireUserContext: false
})(handler)

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}