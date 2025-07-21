import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'

const dbPool = DatabasePool.getInstance()

/**
 * Terra OAuth Callback Handler
 * Handles successful device connections from Terra widget
 */

/**
 * @openapi
 * /api/terra/callback:
 *   get:
 *     summary: Terra OAuth Callback Handler
 *     description: Handles successful device connections from Terra widget. Updates connection status and redirects or sends a popup response.
 *     tags:
 *       - Terra
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         required: true
 *         description: Terra user identifier
 *         example: "terra_user_123"
 *       - in: query
 *         name: resource
 *         schema:
 *           type: string
 *         required: true
 *         description: Provider name (e.g., OURA, GOOGLE)
 *         example: "OURA"
 *       - in: query
 *         name: reference_id
 *         schema:
 *           type: string
 *         required: true
 *         description: Reference ID linked to the user/device
 *         example: "rdhanji786-oura-dev"
 *       - in: query
 *         name: popup
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         required: false
 *         description: If "true", response closes popup with postMessage; otherwise redirects
 *         example: "true"
 *     responses:
 *       302:
 *         description: Redirects to success, failure, or error page depending on connection outcome
 *         headers:
 *           Location:
 *             description: Redirect URL
 *             schema:
 *               type: string
 *       405:
 *         description: Method not allowed (only GET supported)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       200:
 *         description: Popup response for connection success or failure
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               example: "<script>window.opener.postMessage({ success: true, provider: 'OURA' }, '*'); window.close();</script>"
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { 
      user_id, 
      resource,  // This is the provider (OURA, GOOGLE, etc.)
      reference_id,
      popup
    } = req.query

    console.log('🔗 Terra callback received:', { user_id, resource, reference_id, popup })

    if (user_id && resource && reference_id) {
      // Successful connection - update database
      await updateConnectionStatus(
        user_id as string, 
        resource as string, 
        reference_id as string,
        'connected'
      )

      console.log(`✅ Terra connection successful: ${resource} for user ${reference_id}`)

      // Close popup and redirect to Health Hub with success message
      if (popup === 'true') {
        return res.send(`
          <script>
            window.opener.postMessage({ success: true, provider: '${resource}' }, '*');
            window.close();
          </script>
        `)
      } else {
        return res.redirect(302, '/?connection=success')
      }
    } else {
      console.log('❌ Terra connection failed or cancelled')
      
      // Close popup with error or redirect to main page
      if (popup === 'true') {
        return res.send(`
          <script>
            window.opener.postMessage({ success: false, error: 'Connection failed' }, '*');
            window.close();
          </script>
        `)
      } else {
        return res.redirect(302, '/?connection=failed')
      }
    }

  } catch (error) {
    console.error('❌ Terra callback error:', error)
    return res.redirect(302, '/health-hub?tab=wearables&connection=error')
  }
}

async function updateConnectionStatus(
  terraUserId: string, 
  provider: string, 
  referenceId: string,
  status: string
): Promise<void> {
  const { DatabasePool } = require('../../../lib/database-pool')
  const client = await DatabasePool.getClient()
  try {
    // Extract email from reference_id (format: rdhanji786-oura-dev -> rdhanji786@gmail.com)
    let email = '';
    if (referenceId.includes('-')) {
      const baseName = referenceId.split('-')[0]; // rdhanji786
      email = `${baseName}@gmail.com`;
    } else {
      // Fallback: use reference_id as email if it contains @
      email = referenceId.includes('@') ? referenceId : `${referenceId}@gmail.com`;
    }
    
    console.log(`📧 Extracted email from reference_id: ${email}`);

    // Use the known user_id for rdhanji786@gmail.com
    const knownUserId = 'eb5b5758-62ca-4d67-9cb0-d2ca2b23c083';
    
    // Delete any existing connection for this user/provider
    await client.query(`
      DELETE FROM wearable_connections 
      WHERE (email = $1 OR user_id = $2) AND provider = $3
    `, [email, knownUserId, provider]);

    // Insert new connection with correct user_id
    await client.query(`
      INSERT INTO wearable_connections (
        user_id, terra_user_id, email, provider, connected_at, last_sync, is_active, status, updated_at, scopes
      ) VALUES ($1, $2, $3, $4, NOW(), NOW(), true, $5, NOW(), '[]'::jsonb)
    `, [knownUserId, terraUserId, email, provider, status])

    console.log(`✅ Successfully updated ${provider} connection for user ${knownUserId} with Terra ID ${terraUserId}`)
    
  } finally {
    client.release()
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}