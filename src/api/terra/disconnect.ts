import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'

/**
 * Disconnect Terra wearable device
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate session
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization token' })
    }

    const sessionToken = authHeader.substring(7)
    const user = await validateSessionToken(sessionToken)
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const { user_id } = req.body

    if (!user_id) {
      return res.status(400).json({ 
        error: 'user_id is required' 
      })
    }

    console.log(`🔗 Disconnecting Terra user: ${user_id}`)

    const TERRA_API_KEY = process.env.TERRA_API_KEY
    const TERRA_DEV_ID = process.env.TERRA_DEV_ID
    
    if (!TERRA_API_KEY || !TERRA_DEV_ID) {
      throw new Error('Terra production credentials not configured')
    }

    // Disconnect user from Terra
    const disconnectResponse = await fetch(`https://api.tryterra.co/v2/auth/deauthenticate`, {
      method: 'DELETE',
      headers: {
        'dev-id': TERRA_DEV_ID,
        'x-api-key': TERRA_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user: {
          user_id: user_id
        }
      })
    })

    if (!disconnectResponse.ok) {
      const errorText = await disconnectResponse.text()
      throw new Error(`Terra disconnect failed: ${disconnectResponse.status} ${errorText}`)
    }

    const disconnectData = await disconnectResponse.json()

    console.log(`✅ Successfully disconnected Terra user: ${user_id}`)

    return res.status(200).json({
      success: true,
      message: 'Device disconnected successfully',
      data: disconnectData
    })

  } catch (error) {
    console.error('Error disconnecting Terra device:', error)
    return res.status(500).json({ 
      success: false,
      error: 'Failed to disconnect Terra device',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}