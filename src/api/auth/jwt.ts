import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

const UMA_API_URL = 'https://uma-394631772515.us-central1.run.app'

/**
 * @openapi
 * /api/auth/jwt:
 *   post:
 *     summary: Retrieve JWT token from UMA service
 *     description: Sends a GET request to the UMA token service using an API key and returns an access token.
 *     tags:
 *       - Authentication
 *     responses:
 *       200:
 *         description: JWT token successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                   description: The JWT access token
 *                 expires_in:
 *                   type: integer
 *                   description: Token expiration time in seconds
 *       405:
 *         description: Method not allowed (only POST supported)
 *       500:
 *         description: Internal server error or authentication failure
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Attempting JWT token retrieval...')
    console.log('UMA_API_URL:', UMA_API_URL)
    console.log('API Key exists:', !!process.env.UMA_API_KEY)
    
    // Use GET request with basic auth header (matching working Streamlit app)
    const response = await axios.get(`${UMA_API_URL}/get-token`, {
      headers: {
        'Authorization': `basic ${process.env.UMA_API_KEY}`,
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      timeout: 10000
    })

    console.log('JWT token response status:', response.status)
    console.log('JWT token response data:', response.data)

    res.status(200).json({
      access_token: response.data.token,
      expires_in: 3600
    })
  } catch (error: any) {
    console.error('JWT token retrieval failed:')
    console.error('Error message:', error.message)
    console.error('Error status:', error.response?.status)
    console.error('Error data:', error.response?.data)
    console.error('Error config:', error.config?.url)
    
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.response?.data || error.message
    })
  }
}

export default function expressAdapter(req: Request, res: Response) {
  return handler(req as any, res as any);
}