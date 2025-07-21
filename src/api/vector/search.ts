import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { EnhancedVectorSearch } from '../../lib/enhanced-vector-search'

/**
 * @openapi
 * /api/vector/search:
 *   post:
 *     tags:
 *       - SDCO
 *     summary: Perform enhanced vector search on SDCO documents
 *     description: Executes a vector search query with optional filters and returns relevant documents with contextual info.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 example: "chronic pain"
 *                 description: Text query for the vector search.
 *               sdco_id:
 *                 type: string
 *                 nullable: true
 *                 example: "sdco12345"
 *                 description: Optional SDCO document ID for contextual filtering.
 *               limit:
 *                 type: integer
 *                 default: 5
 *                 description: Maximum number of search results to return.
 *               body_system:
 *                 type: string
 *                 nullable: true
 *                 example: "nervous system"
 *                 description: Filter results by body system.
 *               content_types:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *                 example: ["symptoms", "treatments"]
 *                 description: Filter by types of content.
 *     responses:
 *       200:
 *         description: Search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 results:
 *                   type: array
 *                   description: List of relevant SDCO documents
 *                   items:
 *                     type: object
 *                 contextual_information:
 *                   type: object
 *                   description: Additional context for OpenAI integration
 *                 search_metadata:
 *                   type: object
 *                   properties:
 *                     query:
 *                       type: string
 *                       example: "chronic pain"
 *                     sdco_id:
 *                       type: string
 *                       nullable: true
 *                       example: "sdco12345"
 *                     body_system:
 *                       type: string
 *                       nullable: true
 *                       example: "nervous system"
 *                     result_count:
 *                       type: integer
 *                       example: 3
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: '2025-07-21T14:00:00Z'
 *       400:
 *         description: Missing or invalid query parameter
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Vector search failed
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
 *                   example: Vector search failed
 *                 details:
 *                   type: string
 *                   example: Unknown error
 */

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