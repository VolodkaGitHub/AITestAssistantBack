import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import { validateSessionToken } from '../../lib/auth-database'
import { MedicationsService } from '../../lib/medications-service'

const dbPool = DatabasePool.getInstance()

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate session token
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' })
    }

    const sessionToken = authHeader.substring(7)
    const user = await validateSessionToken(sessionToken)
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const { linkedAccountId } = req.body

    if (!linkedAccountId) {
      return res.status(400).json({ error: 'Missing linkedAccountId' })
    }

    console.log(`🔐 Fetching medications for linked account ${linkedAccountId}`)

    // Get linked account details and validate permissions
    const linkedAccountQuery = `
      SELECT linked_email, permissions, relationship_type
      FROM linked_accounts 
      WHERE id = $1 AND (user_id = $2 OR linked_user_id = $2) AND is_active = true
    `
    const linkedAccountResult = await dbPool.query(linkedAccountQuery, [linkedAccountId, user.id])

    if (linkedAccountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Linked account not found' })
    }

    const linkedAccount = linkedAccountResult.rows[0]
    const permissions = Array.isArray(linkedAccount.permissions) 
      ? linkedAccount.permissions 
      : JSON.parse(linkedAccount.permissions || '[]')

    // Check if user has permission to access medications
    const hasPermission = permissions.includes('medications') || permissions.includes('all_data') || permissions.includes('all')

    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Permission denied. Required: medications',
        available_permissions: permissions
      })
    }

    // Get linked user's ID from their email
    const linkedUserQuery = `
      SELECT user_id FROM user_sessions 
      WHERE user_email = $1 
      ORDER BY created_at DESC 
      LIMIT 1
    `
    const linkedUserResult = await dbPool.query(linkedUserQuery, [linkedAccount.linked_email])

    if (linkedUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'Linked user not found in system' })
    }

    const linkedUserId = linkedUserResult.rows[0].user_id

    // Use shared medications service - same logic as user's own API
    const medicationsData = await MedicationsService.getMedicationsForUser(linkedUserId)

    // Apply any business logic transformations
    const processedMedications = MedicationsService.applyBusinessLogic(medicationsData.medications)

    // Create summary text for AI using shared service
    const summary = MedicationsService.createMedicationSummary(processedMedications, linkedAccount.linked_email)

    // Log access for audit trail
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
    await dbPool.query(accessLogQuery, [
      user.email, 
      linkedAccountId, 
      'medications', 
      'medications', 
      true
    ])

    res.status(200).json({
      success: true,
      type: 'medications',
      sourceUser: linkedAccount.linked_email,
      sourceUserName: `${linkedAccount.linked_email.split('@')[0]}`,
      summary,
      data: {
        medications: processedMedications,
        summary: medicationsData.summary
      },
      timestamp: new Date().toISOString(),
      permission: 'medications'
    })

  } catch (error) {
    console.error('❌ Error fetching linked account medications:', error)
    res.status(500).json({ 
      error: 'Failed to fetch medications',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}