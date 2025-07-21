import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { MedicationsService } from '../../lib/medications-service'

/**
 * Medications Mention API
 * Returns formatted medication data for @mention functionality
 * Uses shared MedicationsService for consistency
 */

/**
 * @openapi
 * /api/mention/medications:
 *   get:
 *     summary: Retrieve user medications for mention
 *     description: Returns formatted medication data for @mention functionality. Uses shared MedicationsService for consistency.
 *     tags:
 *       - Mention
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved medications data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: string
 *                   description: Summary description of medications
 *                   example: "3 active medications including: Aspirin, Ibuprofen, Paracetamol"
 *                 data:
 *                   type: object
 *                   properties:
 *                     medications:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: Medication entry object
 *                     total_count:
 *                       type: integer
 *                       description: Total number of medications
 *                     active_count:
 *                       type: integer
 *                       description: Number of active medications
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Timestamp of response generation
 *       401:
 *         description: Unauthorized - missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authorization token required"
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate authentication
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' })
    }

    const token = authHeader.split(' ')[1]
    const user = await validateSessionToken(token)
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    // Use shared medications service for consistency
    const medicationsData = await MedicationsService.getMedicationsForUser(user.id)

    // Format summary for mention (show all medications, not just active)
    let summary = 'No medications recorded'
    if (medicationsData.medications.length > 0) {
      const activeMeds = medicationsData.medications.filter(med => 
        med.status === 'Active' || med.status === 'active' || (med as any).currently_taking
      )
      const allMeds = medicationsData.medications
      
      if (activeMeds.length > 0) {
        const medNames = activeMeds.slice(0, 3).map(med => med.name || (med as any).medication_name)
        if (activeMeds.length > 3) {
          summary = `${activeMeds.length} active medications including: ${medNames.join(', ')}`
        } else {
          summary = `${activeMeds.length} active medication(s): ${medNames.join(', ')}`
        }
      } else {
        // Show all medications including inactive ones
        const medNames = allMeds.slice(0, 3).map(med => med.name || (med as any).medication_name)
        if (allMeds.length > 3) {
          summary = `${allMeds.length} medications including: ${medNames.join(', ')}`
        } else {
          summary = `${allMeds.length} medication(s): ${medNames.join(', ')}`
        }
      }
    }

    return res.status(200).json({
      summary,
      data: {
        medications: medicationsData.medications,
        total_count: medicationsData.medications.length,
        active_count: medicationsData.medications.filter(med => 
          med.status === 'Active' || med.status === 'active' || (med as any).currently_taking
        ).length
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Medications mention API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}