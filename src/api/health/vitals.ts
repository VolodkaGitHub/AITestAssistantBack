import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

/**
 * @openapi
 * /api/health/vitals:
 *   get:
 *     tags:
 *       - Health
 *     summary: Get user's vital signs
 *     description: Retrieves a list of the authenticated user's vital sign measurements with a summary including recent and abnormal values.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vital signs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 vitals:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       measurement_date:
 *                         type: string
 *                         format: date
 *                       blood_pressure_systolic:
 *                         type: integer
 *                       blood_pressure_diastolic:
 *                         type: integer
 *                       heart_rate:
 *                         type: integer
 *                       temperature:
 *                         type: number
 *                         format: float
 *                       weight:
 *                         type: number
 *                         format: float
 *                       height:
 *                         type: number
 *                         format: float
 *                       bmi:
 *                         type: number
 *                         format: float
 *                       oxygen_saturation:
 *                         type: integer
 *                       respiratory_rate:
 *                         type: integer
 *                       blood_glucose:
 *                         type: number
 *                         format: float
 *                       notes:
 *                         type: string
 *                         nullable: true
 *                       measurement_location:
 *                         type: string
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                 latest:
 *                   type: object
 *                   description: Most recent vital measurement
 *                   nullable: true
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     recent:
 *                       type: integer
 *                       description: Number of measurements in last 7 days
 *                     abnormal:
 *                       type: integer
 *                       description: Number of measurements with abnormal values
 *                     lastMeasurementDate:
 *                       type: string
 *                       format: date
 *                       nullable: true
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized - invalid or missing Bearer token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error while fetching vitals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Extract user from session token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const sessionToken = authHeader.split(' ')[1]
    
    // Get user from session
    const userQuery = 'SELECT user_id FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()'
    const userResult = await dbPool.query(userQuery, [sessionToken])
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const userId = userResult.rows[0].user_id

    // Fetch vitals for the user
    const vitalsQuery = `
      SELECT 
        id,
        measurement_date,
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
        notes,
        measurement_location,
        created_at,
        updated_at
      FROM user_vitals 
      WHERE user_id = $1 
      ORDER BY measurement_date DESC, created_at DESC
      LIMIT 50
    `
    
    const vitalsResult = await dbPool.query(vitalsQuery, [userId])

    // Get vitals summary
    const recentVitals = vitalsResult.rows.filter(vital => {
      const measurementDate = new Date(vital.measurement_date)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      return measurementDate >= sevenDaysAgo
    })

    const latestVital = vitalsResult.rows[0] || {}

    // Check for abnormal values
    const abnormalVitals = vitalsResult.rows.filter(vital => {
      const abnormal = []
      if (vital.blood_pressure_systolic > 140 || vital.blood_pressure_systolic < 90) abnormal.push('BP Systolic')
      if (vital.blood_pressure_diastolic > 90 || vital.blood_pressure_diastolic < 60) abnormal.push('BP Diastolic')
      if (vital.heart_rate > 100 || vital.heart_rate < 60) abnormal.push('Heart Rate')
      if (vital.temperature > 100.4 || vital.temperature < 96.8) abnormal.push('Temperature')
      return abnormal.length > 0
    })

    res.status(200).json({
      success: true,
      vitals: vitalsResult.rows,
      latest: latestVital,
      summary: {
        total: vitalsResult.rows.length,
        recent: recentVitals.length,
        abnormal: abnormalVitals.length,
        lastMeasurementDate: vitalsResult.rows.length > 0 ? vitalsResult.rows[0].measurement_date : null
      },
      lastUpdated: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching vitals:', error)
    res.status(500).json({ 
      error: 'Failed to fetch vitals',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}