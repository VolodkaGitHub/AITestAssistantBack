import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { validateSessionToken } from '../../lib/auth-database'

/**
 * @deprecated This endpoint is deprecated. Use POST /api/terra/connections with action: 'reconnect' instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Terra Reconnect Production Endpoint
 * Creates Terra widget sessions for device reconnection
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

    const { provider } = req.body

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' })
    }

    // Get the current domain for redirect URI
    const host = req.headers.host
    const baseUrl = host?.includes('replit.app') || host?.includes('replit.dev') 
      ? `https://${host}` 
      : 'http://localhost:5000'
    
    const redirectUri = `${baseUrl}/api/terra/callback?popup=true`
    const referenceId = `${user.email}-${provider}-${Date.now()}`

    console.log('🔗 Generating Terra reconnect session:', {
      provider,
      user: user.email,
      redirectUri,
      referenceId
    })

    // Generate Terra widget session
    const terraResponse = await fetch('https://api.tryterra.co/v2/auth/generateWidgetSession', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'dev-id': process.env.TERRA_DEV_ID_PROD!,
        'x-api-key': process.env.TERRA_API_KEY_PROD!,
      },
      body: JSON.stringify({
        language: 'en',
        reference_id: referenceId,
        providers: [provider], // Specify the exact provider
        auth_success_redirect_url: redirectUri,
        auth_failure_redirect_url: redirectUri,
      }),
    })

    if (!terraResponse.ok) {
      const errorText = await terraResponse.text()
      console.error('Terra reconnect session error:', {
        status: terraResponse.status,
        error: errorText
      })
      return res.status(500).json({ 
        error: 'Failed to create reconnect session',
        details: errorText
      })
    }

    const terraData = await terraResponse.json()
    
    console.log('✅ Terra reconnect session created:', {
      url: terraData.url,
      session_id: terraData.session_id,
      expires_in: terraData.expires_in,
      provider
    })

    return res.status(200).json({
      success: true,
      connection_url: terraData.url,
      session_id: terraData.session_id,
      expires_in: terraData.expires_in,
      reference_id: referenceId,
      provider: provider.toUpperCase()
    })

  } catch (error) {
    console.error('Terra reconnect production error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}