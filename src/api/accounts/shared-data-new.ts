import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { DatabasePool } from '../../lib/database-pool';

function getRequiredPermission(dataType: string): string {
  const permissionMap: { [key: string]: string } = {
    'medications': 'medications',
    'lab_results': 'lab_results', 
    'wearables': 'wearables',
    'health_data': 'health_data',
    'vitals': 'vitals',
    'oura': 'wearables',
    'googlefit': 'wearables'
  }
  return permissionMap[dataType] || 'health_data'
}

function formatLinkedUserWearablesSummary(dailyScores: any[], userEmail: string): string {
  if (!dailyScores || dailyScores.length === 0) {
    return `${userEmail} has no wearable data available`
  }

  const latestScore = dailyScores[0]
  if (!latestScore) {
    return `${userEmail} has no recent health scores available`
  }

  const scoreDate = new Date(latestScore.score_date).toLocaleDateString()
  const parts = []

  // Sleep score with contributors
  if (latestScore.sleep_score !== null && latestScore.sleep_score !== undefined) {
    const sleepContributors = latestScore.sleep_contributors
    let sleepText = `Sleep: ${latestScore.sleep_score}/100`
    
    if (sleepContributors) {
      const contributors = []
      if (sleepContributors.rem) contributors.push(`REM: ${sleepContributors.rem}`)
      if (sleepContributors.deep) contributors.push(`Deep: ${sleepContributors.deep}`)
      if (sleepContributors.light) contributors.push(`Light: ${sleepContributors.light}`)
      if (sleepContributors.efficiency) contributors.push(`Efficiency: ${sleepContributors.efficiency}%`)
      
      if (contributors.length > 0) {
        sleepText += ` (${contributors.join(', ')})`
      }
    }
    parts.push(sleepText)
  }

  // Stress score with contributors
  if (latestScore.stress_score !== null && latestScore.stress_score !== undefined) {
    const stressContributors = latestScore.stress_contributors
    let stressText = `Stress: ${latestScore.stress_score}/100`
    
    if (stressContributors) {
      const contributors = []
      if (stressContributors.hrv) contributors.push(`HRV: ${stressContributors.hrv}`)
      if (stressContributors.hr) contributors.push(`HR: ${stressContributors.hr}`)
      if (stressContributors.sleep) contributors.push(`Sleep: ${stressContributors.sleep}`)
      if (stressContributors.steps) contributors.push(`Steps: ${stressContributors.steps}`)
      
      if (contributors.length > 0) {
        stressText += ` (${contributors.join(', ')})`
      }
    }
    parts.push(stressText)
  }

  // Respiratory score with contributors
  if (latestScore.respiratory_score !== null && latestScore.respiratory_score !== undefined) {
    const respiratoryContributors = latestScore.respiratory_contributors
    let respiratoryText = `Respiratory: ${latestScore.respiratory_score}/100`
    
    if (respiratoryContributors) {
      const contributors = []
      // Handle both format variations
      if (respiratoryContributors.oxygen_saturation || respiratoryContributors.oxy) {
        const oxyValue = respiratoryContributors.oxygen_saturation || respiratoryContributors.oxy
        contributors.push(`O₂: ${oxyValue}%`)
      }
      if (respiratoryContributors.breathing_regularity || respiratoryContributors.respiration) {
        const breathingValue = respiratoryContributors.breathing_regularity || respiratoryContributors.respiration
        contributors.push(`Breathing: ${breathingValue}`)
      }
      
      if (contributors.length > 0) {
        respiratoryText += ` (${contributors.join(', ')})`
      }
    }
    parts.push(respiratoryText)
  }

  if (parts.length === 0) {
    return `${userEmail} has health data but no processed scores available`
  }

  const summary = `Latest health scores for ${userEmail} (${scoreDate}): ${parts.join(' | ')}`
  const dataCount = dailyScores.length
  
  return `${summary}. ${dataCount} day${dataCount > 1 ? 's' : ''} of data in last 7 days.`
}

/**
 * Get shared data from linked accounts
 * POST /api/accounts/shared-data
 */

/**
 * @openapi
 * /api/accounts/shared-data:
 *   post:
 *     summary: Retrieve shared data from a linked account
 *     description: Fetches health-related data (e.g., medications, lab results, vitals, wearables) from a linked account based on user permissions.
 *     tags:
 *       - Accounts
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - linkedAccountId
 *               - dataType
 *             properties:
 *               linkedAccountId:
 *                 type: string
 *                 description: The ID of the linked account
 *               dataType:
 *                 type: string
 *                 enum: [medications, lab_results, vitals, wearables]
 *                 description: Type of data to retrieve
 *               requestedBy:
 *                 type: string
 *                 description: Optional context for audit logging
 *     responses:
 *       200:
 *         description: Shared data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                   nullable: true
 *                 summary:
 *                   type: string
 *                 sourceUser:
 *                   type: string
 *                 dataType:
 *                   type: string
 *                 permission:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *       400:
 *         description: Bad request — missing or invalid parameters
 *       401:
 *         description: Unauthorized — session token missing or invalid
 *       403:
 *         description: Forbidden — user lacks required permission
 *       404:
 *         description: Linked account or linked user not found
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
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

    const { linkedAccountId, dataType, requestedBy } = req.body

    if (!dataType || !linkedAccountId) {
      return res.status(400).json({ 
        error: 'Missing required parameters: dataType and linkedAccountId' 
      })
    }

    console.log(`🔐 Fetching ${dataType} data for linked account ${linkedAccountId}`)

    const pool = DatabasePool.getInstance()

    // Get linked account details and validate permissions
    const linkedAccountQuery = `
      SELECT la.linked_email as linked_user_email, la.permissions, la.relationship_type,
             la.linked_user_id, u.email as actual_user_email
      FROM linked_accounts la
      LEFT JOIN users u ON u.id = la.linked_user_id
      WHERE la.id = $1 AND (la.user_id = $2 OR la.linked_user_id = $2)
    `
    const linkedAccountResult = await pool.query(linkedAccountQuery, [linkedAccountId, user.id])

    if (linkedAccountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Linked account not found' })
    }

    const linkedAccount = linkedAccountResult.rows[0]
    // Use the actual user email if available, fallback to linked_email
    const linkedUserEmail = linkedAccount.actual_user_email || linkedAccount.linked_user_email
    const permissions = Array.isArray(linkedAccount.permissions) 
      ? linkedAccount.permissions 
      : JSON.parse(linkedAccount.permissions || '[]')

    const requiredPermission = getRequiredPermission(dataType)
    const hasPermission = permissions.includes(requiredPermission) || permissions.includes('all_data') || permissions.includes('all')

    if (!hasPermission) {
      return res.status(403).json({ 
        error: `Permission denied. Required: ${requiredPermission}`,
        available_permissions: permissions
      })
    }

    // Get linked user's ID
    // Get the linked user ID directly from the linked_accounts table
    const linkedUserId = linkedAccount.linked_user_id
    
    if (!linkedUserId) {
      return res.status(404).json({ error: 'Linked user ID not found' })
    }

    // Fetch the requested data
    let sharedData: any = null
    let summary = ''

    switch (dataType) {
      case 'medications':
        const medicationsQuery = `
          SELECT medication_name, dosage, frequency, prescribed_date, prescribing_doctor, notes
          FROM medications 
          WHERE user_id = $1 
          ORDER BY prescribed_date DESC
        `
        const medicationsResult = await pool.query(medicationsQuery, [linkedUserId])
        sharedData = medicationsResult.rows
        
        if (sharedData.length > 0) {
          const medicationNames = sharedData.map((med: any) => med.medication_name).join(', ')
          summary = `${linkedAccount.linked_user_email} is currently taking ${sharedData.length} medication${sharedData.length > 1 ? 's' : ''}: ${medicationNames}`
        } else {
          summary = `${linkedAccount.linked_user_email} has no medications on record`
        }
        break

      case 'lab_results':
        const labQuery = `
          SELECT test_name, result_value, reference_range, test_date, lab_name, notes
          FROM lab_results 
          WHERE user_id = $1 
          ORDER BY test_date DESC
          LIMIT 10
        `
        const labResult = await pool.query(labQuery, [linkedUserId])
        sharedData = labResult.rows
        summary = `Recent lab results for ${linkedAccount.linked_user_email}: ${sharedData.length} test${sharedData.length > 1 ? 's' : ''}`
        break

      case 'vitals':
        const vitalsQuery = `
          SELECT measurement_type, value, unit, recorded_at, notes
          FROM vitals 
          WHERE user_id = $1 
          ORDER BY recorded_at DESC
          LIMIT 20
        `
        const vitalsResult = await pool.query(vitalsQuery, [linkedUserId])
        sharedData = vitalsResult.rows
        summary = `Recent vital signs for ${linkedAccount.linked_user_email}: ${sharedData.length} measurement${sharedData.length > 1 ? 's' : ''}`
        break

      case 'wearables':
        // Get daily health scores from the aggregated system for linked user
        const { dailyHealthAggregator } = await import('../../lib/daily-health-aggregator')
        
        // Convert UUID to string for daily_health_scores table compatibility
        const linkedUserIdString = linkedUserId.toString()
        
        console.log(`🔍 DEBUG: Fetching daily scores for linked user ID: ${linkedUserIdString}`)
        console.log(`🔍 DEBUG: Original UUID: ${linkedUserId}`)
        
        const dailyScores = await dailyHealthAggregator.getUserDailyScores(
          linkedUserIdString,
          undefined, // start_date - will default to recent data
          undefined, // end_date - will default to today  
          7 // last 7 days
        )
        
        console.log(`🔍 DEBUG: Daily scores result:`, dailyScores)
        console.log(`🔍 DEBUG: Daily scores length:`, dailyScores ? dailyScores.length : 'null')

        if (!dailyScores || dailyScores.length === 0) {
          sharedData = null
          summary = `${linkedAccount.linked_user_email} has no wearable data available from connected devices`
        } else {
          sharedData = dailyScores
          summary = formatLinkedUserWearablesSummary(dailyScores, linkedAccount.linked_user_email)
        }
        break

      default:
        return res.status(400).json({ error: `Unsupported data type: ${dataType}` })
    }

    // Log successful access
    const accessLogQuery = `
      INSERT INTO account_access_logs (
        requesting_user_email,
        linked_account_id,
        data_type,
        permission_used,
        access_granted,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `
    await pool.query(accessLogQuery, [
      user.email, 
      linkedAccountId, 
      dataType, 
      requiredPermission, 
      true
    ])

    return res.status(200).json({
      success: true,
      data: sharedData,
      summary,
      sourceUser: linkedAccount.linked_user_email,
      dataType,
      permission: requiredPermission,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Error fetching shared data:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}