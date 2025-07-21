import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import { validateSessionToken } from '../../lib/auth-database'

/**
 * Vitals Mention API
 * Returns formatted vitals data for @mention functionality
 */

/**
 * @openapi
 * /api/mention/vitals:
 *   get:
 *     summary: Retrieve user vitals for mention
 *     description: Returns formatted vital signs data for @mention functionality.
 *     tags:
 *       - Mention
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved vitals data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: string
 *                   description: Summary of user's vitals
 *                   example: "5 vital measurements, 3 recent (last 30 days), Latest: BP: 120/80, HR: 70 bpm, Temp: 98.6°F, 1 abnormal readings"
 *                 data:
 *                   type: object
 *                   properties:
 *                     vitals:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/VitalEntry'
 *                     latest:
 *                       $ref: '#/components/schemas/VitalEntry'
 *                       nullable: true
 *                     recent:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/VitalEntry'
 *                     abnormal:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/VitalEntry'
 *                     total_count:
 *                       type: integer
 *                       description: Total number of vital entries
 *                     recent_count:
 *                       type: integer
 *                       description: Number of recent vital entries (last 30 days)
 *                     abnormal_count:
 *                       type: integer
 *                       description: Number of abnormal vital readings
 *                     last_measurement_date:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: Date of the latest vital measurement
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Response generation timestamp
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
 *   schemas:
 *     VitalEntry:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         blood_pressure_systolic:
 *           type: integer
 *         blood_pressure_diastolic:
 *           type: integer
 *         heart_rate:
 *           type: integer
 *         temperature:
 *           type: number
 *           format: float
 *         weight:
 *           type: number
 *           format: float
 *         height:
 *           type: number
 *           format: float
 *         bmi:
 *           type: number
 *           format: float
 *         oxygen_saturation:
 *           type: integer
 *         respiratory_rate:
 *           type: integer
 *         blood_glucose:
 *           type: number
 *           format: float
 *         measurement_date:
 *           type: string
 *           format: date-time
 *         measurement_location:
 *           type: string
 *         notes:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
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

    const client = await DatabasePool.getClient()

    try {
      // Fetch user vitals
      const query = `
        SELECT 
          id,
          blood_pressure_systolic,
          blood_pressure_diastolic,
          heart_rate,
          temperature,
          weight,
          height,
          bmi,
          oxygen_saturation,
          respiratory_rate,
          blood_glucose,
          measurement_date,
          measurement_location,
          notes,
          created_at,
          updated_at
        FROM user_vitals 
        WHERE user_id = $1 
        ORDER BY measurement_date DESC, created_at DESC
        LIMIT 10
      `
      
      const result = await client.query(query, [user.id])
      const vitals = result.rows

      // Get recent vitals (last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const recentVitals = vitals.filter(vital => {
        const measurementDate = new Date(vital.measurement_date)
        return measurementDate >= thirtyDaysAgo
      })

      // Check for abnormal values
      const abnormalVitals = vitals.filter(vital => {
        const abnormal = []
        if (vital.blood_pressure_systolic > 140 || vital.blood_pressure_systolic < 90) abnormal.push('BP Systolic')
        if (vital.blood_pressure_diastolic > 90 || vital.blood_pressure_diastolic < 60) abnormal.push('BP Diastolic')
        if (vital.heart_rate > 100 || vital.heart_rate < 60) abnormal.push('Heart Rate')
        if (vital.temperature > 100.4 || vital.temperature < 96.8) abnormal.push('Temperature')
        return abnormal.length > 0
      })

      // Get latest vital
      const latestVital = vitals.length > 0 ? vitals[0] : null

      // Format summary for mention
      let summary = 'No vital signs recorded'
      if (vitals.length > 0) {
        const parts = [`${vitals.length} vital measurements`]
        
        if (recentVitals.length > 0) {
          parts.push(`${recentVitals.length} recent (last 30 days)`)
        }
        
        if (latestVital) {
          const latestParts = []
          if (latestVital.blood_pressure_systolic && latestVital.blood_pressure_diastolic) {
            latestParts.push(`BP: ${latestVital.blood_pressure_systolic}/${latestVital.blood_pressure_diastolic}`)
          }
          if (latestVital.heart_rate) {
            latestParts.push(`HR: ${latestVital.heart_rate} bpm`)
          }
          if (latestVital.temperature) {
            latestParts.push(`Temp: ${latestVital.temperature}°F`)
          }
          
          if (latestParts.length > 0) {
            parts.push(`Latest: ${latestParts.join(', ')}`)
          }
        }
        
        if (abnormalVitals.length > 0) {
          parts.push(`${abnormalVitals.length} abnormal readings`)
        }
        
        summary = parts.join(', ')
      }

      return res.status(200).json({
        summary,
        data: {
          vitals,
          latest: latestVital,
          recent: recentVitals,
          abnormal: abnormalVitals,
          total_count: vitals.length,
          recent_count: recentVitals.length,
          abnormal_count: abnormalVitals.length,
          last_measurement_date: latestVital ? latestVital.measurement_date : null
        },
        timestamp: new Date().toISOString()
      })

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Vitals mention API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}