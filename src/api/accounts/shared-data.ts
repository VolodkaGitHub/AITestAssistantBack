import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'
import { AccountLinkingDatabase } from '../../lib/account-linking-database'
import { WearablesDatabase } from '../../lib/wearables-database'

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

/**
 * Get shared data from linked accounts
 * GET /api/accounts/shared-data?data_type=wearables&linked_user_email=user@example.com
 */

/**
 * @openapi
 * /api/accounts/shared-data:
 *   post:
 *     summary: Fetch shared health data from a linked account
 *     description: Authenticated users can request health-related data such as wearables, medications, lab results, and vitals from a linked account, subject to permission checks.
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
 *                 description: ID of the linked account to access
 *               dataType:
 *                 type: string
 *                 enum: [wearables, health_data, medications, lab_results, vitals, all]
 *                 description: Type of health data being requested
 *               requestedBy:
 *                 type: string
 *                 description: Optional identifier for auditing or contextual purposes
 *     responses:
 *       200:
 *         description: Data successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 shared_data:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     owner_email:
 *                       type: string
 *                     last_updated:
 *                       type: string
 *                       nullable: true
 *                     data:
 *                       type: object
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 access_granted_at:
 *                   type: string
 *                 data_owner:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     relationship:
 *                       type: string
 *                     linked_since:
 *                       type: string
 *       400:
 *         description: Bad request — missing or unsupported parameters
 *       401:
 *         description: Unauthorized — missing or invalid session token
 *       403:
 *         description: Forbidden — insufficient permissions to access requested data
 *       404:
 *         description: Linked account not found
 *       405:
 *         description: Method not allowed (only POST supported)
 *       500:
 *         description: Internal server error or unexpected failure
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

    console.log(`🔐 Checking data sharing permissions for ${user.email} accessing linked account ${linkedAccountId} for ${dataType}`)

    // Validate access to linked account data using the validate-access endpoint logic
    const validateResponse = await fetch(`${req.headers.host}/api/accounts/validate-access`, {
      method: 'POST',
      headers: {
        'Authorization': req.headers.authorization || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        linkedAccountId,
        dataType,
        requiredPermission: getRequiredPermission(dataType)
      })
    })

    if (!validateResponse.ok) {
      const errorData = await validateResponse.json()
      return res.status(validateResponse.status).json(errorData)
    }

    const { linkedUser } = await validateResponse.json()

    // Fetch the requested data based on type
    let sharedData: any = null

    switch (dataType) {
      case 'wearables':
        // Get wearables data for the linked user
        const healthMetrics = await WearablesDatabase.getLatestHealthMetrics(linkedUser.id)
        sharedData = {
          type: 'wearables',
          owner_email: linkedUser.email,
          data: healthMetrics,
          last_updated: healthMetrics?.summary?.last_sync || null
        }
        break

      case 'health_data':
        // Get general health data (could expand to include more sources)
        sharedData = {
          type: 'health_data',
          owner_email: linkedUser.email,
          data: {
            message: 'General health data sharing not yet implemented',
            available_soon: true
          }
        }
        break

      case 'medications':
        // Get medications data
        sharedData = {
          type: 'medications',
          owner_email: linkedUser.email,
          data: {
            message: 'Medications data sharing not yet implemented',
            available_soon: true
          }
        }
        break

      case 'lab_results':
        // Get lab results data
        sharedData = {
          type: 'lab_results',
          owner_email: linkedUser.email,
          data: {
            message: 'Lab results data sharing not yet implemented',
            available_soon: true
          }
        }
        break

      case 'vitals':
        // Get vitals data
        sharedData = {
          type: 'vitals',
          owner_email: linkedUser.email,
          data: {
            message: 'Vitals data sharing not yet implemented',
            available_soon: true
          }
        }
        break

      case 'all':
        // Get all available data types
        const allWearables = await WearablesDatabase.getLatestHealthMetrics(linkedUser.id)
        sharedData = {
          type: 'all',
          owner_email: linkedUser.email,
          data: {
            wearables: allWearables,
            health_data: { available_soon: true },
            medications: { available_soon: true },
            lab_results: { available_soon: true },
            vitals: { available_soon: true }
          },
          last_updated: allWearables?.summary?.last_sync || null
        }
        break

      default:
        return res.status(400).json({ 
          error: 'Invalid dataType',
          supported_types: ['wearables', 'health_data', 'medications', 'lab_results', 'vitals', 'all']
        })
    }

    console.log(`✅ Successfully shared ${dataType} data from ${linkedUser.email} to ${user.email}`)

    return res.status(200).json({
      success: true,
      shared_data: sharedData,
      permissions: Array.isArray(linkedUser.permissions) ? linkedUser.permissions : [],
      access_granted_at: new Date().toISOString(),
      data_owner: {
        email: linkedUser.email,
        relationship: 'linked_account',
        linked_since: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Error fetching shared data:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch shared data',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}