import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import axios from 'axios'
import { getValidJWTToken } from '../../lib/jwt-manager'

const MERLIN_ENDPOINT = 'https://merlin-394631772515.us-central1.run.app'

/**
 * @openapi
 * /api/database/populate:
 *   post:
 *     summary: Sync SDCO data from Merlin API
 *     description: Fetches SDCO list and updates local database.
 *     tags:
 *       - Database
 *     responses:
 *       200:
 *         description: SDCO data synchronized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 records_inserted:
 *                   type: integer
 *                   example: 15
 *                 total_records:
 *                   type: integer
 *                   example: 15
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to populate database"
 *                 details:
 *                   type: string
 *                   example: "Timeout reached while fetching data"
 */


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const dbPool = DatabasePool.getInstance()

  try {
    console.log('Getting JWT token...')
    const token = await getValidJWTToken()
    
    console.log('Fetching SDCO list from Merlin API...')
    const response = await axios.put(
      `${MERLIN_ENDPOINT}/api/v1/diagnostic/get-platform-sdco-list`,
      { platform_id: "Mobile" },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )

    const sdcoList = response.data.sdco_references || []
    console.log(`Found ${sdcoList.length} SDCO references`)

    console.log('Clearing existing data...')
    await dbPool.query('DELETE FROM sdco_headers')

    console.log('Inserting SDCO data...')
    let inserted = 0

    for (const sdco of sdcoList) {
      const combinedText = [
        sdco.display_name || '',
        sdco.display_name_layman || '',
        sdco.sdco_id || ''
      ].join(' ').trim()

      await dbPool.query(`
        INSERT INTO sdco_headers (sdco_id, version, display_name, display_name_layman, 
                                description, definition, definition_layman, categories, combined_text)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (sdco_id) DO UPDATE SET
            version = EXCLUDED.version,
            display_name = EXCLUDED.display_name,
            display_name_layman = EXCLUDED.display_name_layman,
            combined_text = EXCLUDED.combined_text,
            updated_at = CURRENT_TIMESTAMP
      `, [
        sdco.sdco_id,
        sdco.version || '1.0',
        sdco.display_name,
        sdco.display_name_layman,
        '', // description - not available in this endpoint
        '', // definition - not available in this endpoint  
        '', // definition_layman - not available in this endpoint
        JSON.stringify([]), // categories - not available in this endpoint
        combinedText
      ])

      inserted++
    }

    console.log(`Successfully populated ${inserted} SDCO entries`)

    // Update cache metadata
    await dbPool.query(`
      INSERT INTO cache_metadata (cache_type, last_updated, total_records, api_endpoint, status)
      VALUES ('sdco_headers', CURRENT_TIMESTAMP, $1, 'get-platform-sdco-list', 'active')
      ON CONFLICT (cache_type) DO UPDATE SET
        last_updated = CURRENT_TIMESTAMP,
        total_records = EXCLUDED.total_records,
        status = EXCLUDED.status
    `, [inserted])

    res.status(200).json({
      success: true,
      records_inserted: inserted,
      total_records: sdcoList.length
    })

  } catch (error: any) {
    console.error('Error populating database:', error.message)
    res.status(500).json({ 
      error: 'Failed to populate database',
      details: error.message
    })
  } finally {
    await DatabasePool.getInstance().end()
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}

