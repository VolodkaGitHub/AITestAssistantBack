import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

const MERLIN_ENDPOINT = 'https://merlin-394631772515.us-central1.run.app'

/**
 * @openapi
 * /api/symptoms/queue:
 *   post:
 *     summary: Add symptoms to the queue for a diagnostic session and refresh differential diagnosis
 *     description: |
 *       Adds a list of symptom SDCO IDs to a diagnostic session queue via Merlin API,
 *       then refreshes and returns the updated differential diagnosis.
 *     tags:
 *       - Symptoms
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - sdcoIds
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: Session identifier for the diagnostic session
 *                 example: "session_12345"
 *               sdcoIds:
 *                 type: array
 *                 description: Array of symptom SDCO IDs to add to the queue
 *                 items:
 *                   type: string
 *                 example: ["sdco_001", "sdco_002", "sdco_003"]
 *               jwtToken:
 *                 type: string
 *                 description: Optional JWT token for authentication; if not provided, it will be retrieved automatically
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Symptoms added and differential diagnosis refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 added_symptoms:
 *                   type: integer
 *                   description: Number of symptoms added to the queue
 *                   example: 3
 *                 session_id:
 *                   type: string
 *                   description: Diagnostic session ID
 *                   example: "session_12345"
 *                 updated_diagnosis:
 *                   type: array
 *                   description: Updated differential diagnosis results
 *                   items:
 *                     type: object
 *       400:
 *         description: Missing or invalid parameters (sessionId or sdcoIds)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Session ID and SDCO IDs array required"
 *       405:
 *         description: Method not allowed (only POST supported)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Internal server error or failure to add symptoms
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to add symptoms to queue"
 *                 details:
 *                   type: string
 *                   example: "Detailed error message"
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { sessionId, sdcoIds, jwtToken } = req.body

    if (!sessionId || !sdcoIds || !Array.isArray(sdcoIds) || sdcoIds.length === 0) {
      return res.status(400).json({ 
        error: 'Session ID and SDCO IDs array required' 
      })
    }

    console.log('Adding symptoms to queue:', { sessionId, sdcoIds: sdcoIds.length })

    // Get JWT token if not provided
    let token = jwtToken
    if (!token) {
      const authResponse = await axios.post(`${process.env.NEXTAUTH_URL || 'https://treatmentglm.replit.app'}/api/auth/jwt`)
      token = authResponse.data.access_token
    }

    // Add symptoms to queue using the add-symptoms-to-queue endpoint
    const response = await axios.post(
      `${MERLIN_ENDPOINT}/api/v1/dx-session/add-symptoms-to-queue`,
      {
        persistanceSession: sessionId,
        sdco_ids: sdcoIds,
        platform_id: "Mobile"
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )

    console.log('Add symptoms to queue response:', response.status)
    console.log('Response data:', response.data)

    // After adding symptoms, refresh differential diagnosis
    const updatedDiagnosis = await refreshDifferentialDiagnosis(sessionId, token)

    res.status(200).json({
      success: true,
      added_symptoms: sdcoIds.length,
      session_id: sessionId,
      updated_diagnosis: updatedDiagnosis
    })

  } catch (error) {
    console.error('Add symptoms to queue failed:', error)
    
    if (axios.isAxiosError(error)) {
      console.error('API Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      })
      
      res.status(error.response?.status || 500).json({
        error: 'Failed to add symptoms to queue',
        details: error.response?.data || error.message
      })
    } else {
      res.status(500).json({
        error: 'Failed to add symptoms to queue',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

async function refreshDifferentialDiagnosis(sessionId: string, jwtToken: string): Promise<any[]> {
  try {
    const response = await axios.put(
      `${MERLIN_ENDPOINT}/api/v1/dx-session/get-differential-diagnosis`,
      { 
        persistanceSession: sessionId,
        platform_id: "Mobile"
      },
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )

    console.log('Refreshed differential diagnosis response:', response.status)
    
    // Extract diagnoses and keep original structure for DifferentialDiagnosis component
    const diagnoses = response.data.differential_diagnosis || []
    return diagnoses
  } catch (error) {
    console.error('Failed to refresh differential diagnosis:', error)
    return []
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}