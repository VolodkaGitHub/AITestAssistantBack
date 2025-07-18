import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { getValidJWTToken } from '../../lib/jwt-manager'

interface RefreshDiagnosisRequest {
  sessionId: string
}

interface RefreshDiagnosisResponse {
  differentialDiagnosis: any[]
  sessionId: string
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RefreshDiagnosisResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { sessionId }: RefreshDiagnosisRequest = req.body

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' })
    }

    // Get JWT token
    const token = await getValidJWTToken()

    if (!token) {
      return res.status(401).json({ error: 'Authentication failed' })
    }

    // Call Merlin API to get updated differential diagnosis
    const MERLIN_ENDPOINT = 'https://merlin-394631772515.us-central1.run.app'
    const merlinResponse = await fetch(
      `${MERLIN_ENDPOINT}/api/v1/dx-session/get-differential-diagnosis`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          persistanceSession: sessionId,
          platform_id: "Mobile"
        })
      }
    )

    if (!merlinResponse.ok) {
      console.error('Merlin API error:', merlinResponse.status, await merlinResponse.text())
      return res.status(500).json({ error: 'Failed to refresh differential diagnosis' })
    }

    const data = await merlinResponse.json()

    // Filter and format differential diagnosis (same logic as session creation)
    const filteredDiagnosis = (data.differential_diagnosis || [])
      .filter((item: any) => item.probability > 0.05) // Only show conditions with >5% probability
      .sort((a: any, b: any) => b.probability - a.probability) // Sort by probability descending

    console.log(`Refreshed differential diagnosis: ${filteredDiagnosis.length} conditions`)

    return res.status(200).json({
      differentialDiagnosis: filteredDiagnosis,
      sessionId: data.persistanceSession || sessionId
    })

  } catch (error) {
    console.error('Refresh differential diagnosis error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}