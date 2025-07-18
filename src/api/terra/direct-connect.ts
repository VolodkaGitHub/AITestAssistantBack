import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'

/**
 * @deprecated This endpoint is deprecated. Use POST /api/terra/connections with action: 'reconnect' instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Direct Terra Connection API (Backup Method)
 * Provides direct OAuth URLs when Terra generateAuthURL is unavailable
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate user session
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' })
    }

    const sessionToken = authHeader.substring(7)
    const user = await validateSessionToken(sessionToken)
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    const { provider } = req.body

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' })
    }

    // Get current domain for callback
    const host = req.headers.host
    const baseUrl = host?.includes('replit.app') || host?.includes('replit.dev') 
      ? `https://${host}` 
      : 'http://localhost:5000'
    
    const redirectUri = `${baseUrl}/api/terra/callback?popup=true`

    // Note: Direct OAuth requires separate app registration with each provider
    // For now, we'll attempt Terra-style connection but with corrected parameters
    
    // Attempt Terra Widget Session (v2 API)
    const terraResponse = await fetch('https://api.tryterra.co/v2/auth/generateWidgetSession', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'dev-id': process.env.TERRA_DEV_ID_PROD!,
        'x-api-key': process.env.TERRA_API_KEY_PROD!,
      },
      body: JSON.stringify({
        language: 'en',
        reference_id: `${user.email}-${provider}-${Date.now()}`,
        auth_success_redirect_url: redirectUri,
        auth_failure_redirect_url: redirectUri,
      }),
    })

    if (terraResponse.ok) {
      const terraData = await terraResponse.json()
      if (terraData.url) {
        console.log(`✅ Terra widget session successful for ${provider}`)
        return res.status(200).json({
          success: true,
          auth_url: terraData.url,
          user_id: terraData.session_id || 'pending',
          method: 'terra_widget',
          provider: provider.toUpperCase(),
          session_id: terraData.session_id,
          expires_in: terraData.expires_in
        })
      }
    }

    console.log(`❌ Terra direct connection failed for ${provider}:`, terraResponse.status)
    
    // Fallback: return error with suggestion for manual setup
    return res.status(503).json({ 
      error: `Direct OAuth for ${provider} requires separate app registration. Terra API currently unavailable (${terraResponse.status}).`,
      suggestion: 'Terra service may be experiencing issues. Please try again later.',
      terraStatus: terraResponse.status
    })

  } catch (error) {
    console.error('Direct Terra connect error:', error)
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}