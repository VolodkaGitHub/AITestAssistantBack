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

/**
 * @openapi
 * /api/symptoms/search:
 *   post:
 *     summary: Perform enhanced vector search for symptoms
 *     description: |
 *       Searches symptoms using an enhanced fixed vector search algorithm with configurable confidence threshold and result limit.
 *     tags:
 *       - Symptoms
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - symptom
 *             properties:
 *               symptom:
 *                 type: string
 *                 description: Symptom text to search for
 *                 example: "headache"
 *               confidence_threshold:
 *                 type: number
 *                 description: Minimum relevance score to include in results (default 0.05)
 *                 example: 0.1
 *               limit:
 *                 type: integer
 *                 description: Maximum number of search results to return (default 10)
 *                 example: 5
 *     responses:
 *       200:
 *         description: Search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   description: List of matched symptoms
 *                   items:
 *                     type: object
 *                     properties:
 *                       sdco_id:
 *                         type: string
 *                         description: Unique symptom identifier
 *                         example: "sdco_12345"
 *                       display_name:
 *                         type: string
 *                         description: Symptom display name
 *                         example: "Headache"
 *                       display_name_layman:
 *                         type: string
 *                         description: Layman-friendly symptom name
 *                         example: "Head pain"
 *                       description:
 *                         type: string
 *                         description: Description or matched content snippet
 *                         example: "Pain in the head area."
 *                       definition_layman:
 *                         type: string
 *                         description: Layman definition or body system
 *                         example: "Nervous system"
 *                       categories:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: Categories related to the symptom
 *                         example: []
 *                       relevance_score:
 *                         type: number
 *                         description: Relevance score from vector search
 *                         example: 0.87
 *                       match_type:
 *                         type: string
 *                         description: Type of match found
 *                         example: "fixed_942_document_search"
 *                 search_term:
 *                   type: string
 *                   description: The symptom query text used in search
 *                   example: "headache"
 *                 total_results:
 *                   type: integer
 *                   description: Number of results returned after filtering by confidence threshold
 *                   example: 3
 *                 search_type:
 *                   type: string
 *                   example: "enhanced_vector_search"
 *       400:
 *         description: Bad request, missing required parameter symptom
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Symptom parameter required"
 *       405:
 *         description: Method not allowed, only POST supported
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Internal server error or database misconfiguration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Enhanced vector search failed"
 *                 details:
 *                   type: string
 *                   example: "Database configuration missing"
 */

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
export const wrappedHandler = withScalableMiddleware("SYMPTOM_SEARCH", {
  requireSession: false,
  requireUserContext: false
})(handler)

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}