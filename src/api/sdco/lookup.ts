import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import { getValidJWTToken } from '../../lib/jwt-manager'

const MERLIN_ENDPOINT = 'https://merlin-394631772515.us-central1.run.app'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Fetching SDCO list from Merlin API...')
    
    // Get fresh JWT token
    const token = await getValidJWTToken()
    
    // Call the correct SDCO endpoint with proper method and payload
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

    console.log('SDCO list response status:', response.status)
    const sdcoList = response.data.sdco_references || []
    console.log('Total SDCO references:', sdcoList.length)

    // Find headache-related SDCO entries
    const headacheSDCOs = sdcoList.filter((item: any) => 
      item.display_name?.toLowerCase().includes('headache') ||
      item.sdco_id?.toLowerCase().includes('headache')
    )

    // Find chest pain SDCO for comparison
    const chestPainSDCOs = sdcoList.filter((item: any) => 
      item.display_name?.toLowerCase().includes('chest pain') ||
      item.sdco_id?.toLowerCase().includes('chest_pain')
    )

    // Extract a sample of SDCO IDs for debugging
    const sampleSDCOs = sdcoList.slice(0, 10).map((item: any) => ({
      sdco_id: item.sdco_id,
      display_name: item.display_name,
      display_name_layman: item.display_name_layman
    }))

    res.status(200).json({
      total_count: sdcoList.length,
      headache_sdcos: headacheSDCOs,
      chest_pain_sdcos: chestPainSDCOs,
      sample_sdcos: sampleSDCOs
    })
  } catch (error: any) {
    console.error('SDCO lookup failed:', error.message)
    res.status(500).json({ 
      error: 'Failed to fetch SDCO list',
      details: error.response?.data || error.message
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}