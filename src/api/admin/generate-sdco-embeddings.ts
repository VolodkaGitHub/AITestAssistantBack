import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import OpenAI from 'openai'

const dbPool = DatabasePool.getInstance()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * @openapi
 * /api/admin/generate-sdco-embed:
 *   post:
 *     summary: Generate embeddings for SDCO documents
 *     description: Fetches SDCO documents without vector embeddings, generates embeddings using OpenAI, and updates the database.
 *     tags:
 *       - Admin
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               batchSize:
 *                 type: number
 *                 default: 20
 *     responses:
 *       200:
 *         description: Embedding process completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 processed:
 *                   type: number
 *                 errors:
 *                   type: number
 *                 total_documents:
 *                   type: number
 *                 with_embeddings:
 *                   type: number
 *                 remaining:
 *                   type: number
 *                 message:
 *                   type: string
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Server error during embedding generation
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { batchSize = 20 } = req.body

    console.log('🔍 Fetching SDCO documents without embeddings...')
    
    // Get documents without embeddings
    const { rows: documents } = await dbPool.query(`
      SELECT id, sdco_id, medical_term, layman_term, description, combined_text
      FROM public.sdco_documents 
      WHERE vector_embedding IS NULL
      ORDER BY id
      LIMIT $1
    `, [batchSize])

    if (documents.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All SDCO documents already have embeddings',
        processed: 0,
        total: 0
      })
    }

    console.log(`📊 Processing ${documents.length} documents`)
    
    let processed = 0
    let errors = 0

    // Process documents in parallel batches
    const batchPromises = documents.map(async (doc) => {
      try {
        // Create combined text for embedding
        const text = doc.combined_text || 
          `${doc.medical_term || ''} ${doc.layman_term || ''} ${doc.description || ''}`.trim()
        
        if (text.length === 0) {
          console.log(`⚠️ Skipping ${doc.sdco_id} - no text content`)
          return false
        }

        // Generate embedding
        const response = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: text
        })

        const embedding = response.data[0].embedding

        // Update document with embedding
        await dbPool.query(`
          UPDATE public.sdco_documents 
          SET vector_embedding = $1::vector
          WHERE id = $2
        `, [JSON.stringify(embedding), doc.id])

        console.log(`✅ Generated embedding for: ${doc.medical_term}`)
        processed++
        return true

      } catch (error) {
        console.error(`❌ Error processing ${doc.sdco_id}:`, error)
        errors++
        return false
      }
    })

    // Wait for all embeddings to complete
    await Promise.all(batchPromises)

    // Get total counts
    const { rows: totalRows } = await dbPool.query(`
      SELECT 
        COUNT(*) as total_docs,
        COUNT(vector_embedding) as with_embeddings,
        COUNT(*) - COUNT(vector_embedding) as remaining
      FROM public.sdco_documents
    `)

    const stats = totalRows[0]

    return res.status(200).json({
      success: true,
      processed,
      errors,
      total_documents: parseInt(stats.total_docs),
      with_embeddings: parseInt(stats.with_embeddings),
      remaining: parseInt(stats.remaining),
      message: `Successfully processed ${processed} documents. ${stats.remaining} remaining.`
    })

  } catch (error) {
    console.error('❌ Error generating SDCO embeddings:', error)
    return res.status(500).json({ 
      error: 'Failed to generate embeddings',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}