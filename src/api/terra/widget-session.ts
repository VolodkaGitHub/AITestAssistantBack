import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Validate session and get user ID
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' })
    }

    const sessionToken = authHeader.replace('Bearer ', '')

    // Validate session and get user data
    const validateResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionToken })
    })

    if (!validateResponse.ok) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    const { user } = await validateResponse.json()
    const { referenceId = `${user.email.split('@')[0]}-terra-${Date.now()}`, provider, providers = [provider?.toUpperCase() || 'OURA'] } = req.body

    // Create Terra widget session using actual Terra API
    const terraResponse = await fetch('https://api.tryterra.co/v2/auth/generateWidgetSession', {
      method: 'POST',
      headers: {
        'dev-id': process.env.TERRA_DEV_ID_PROD || process.env.TERRA_DEV_ID || '',
        'x-api-key': process.env.TERRA_API_KEY_PROD || process.env.TERRA_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        providers: providers.join(','),
        language: 'en',
        reference_id: referenceId,
        auth_success_redirect_url: `${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/api/terra/callback`,
        auth_failure_redirect_url: `${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/health-hub?error=connection_failed`
      })
    })

    if (!terraResponse.ok) {
      const errorData = await terraResponse.text()
      console.error('Terra API error:', errorData)
      throw new Error(`Terra API failed: ${terraResponse.status} ${errorData}`)
    }

    const terraData = await terraResponse.json()
    
    const sessionData = {
      sessionId: terraData.session_id || `terra_session_${Date.now()}`,
      widgetUrl: terraData.url || `https://widget.tryterra.co/session/${terraData.session_id}`,
      expiresAt: new Date(Date.now() + (terraData.expires_in || 900) * 1000).toISOString(),
      providers,
      referenceId,
      userId: user.id,
      userEmail: user.email,
      status: 'active',
      terraSessionId: terraData.session_id
    }

    console.log(`✅ Created Terra widget session for ${user.email}:`, {
      sessionId: sessionData.sessionId,
      referenceId: sessionData.referenceId,
      providers: sessionData.providers
    })

    // Return response with all required fields for frontend
    return res.status(200).json({
      success: true,
      session: sessionData,
      session_id: sessionData.sessionId, // E2E test looks for session_id
      sessionId: sessionData.sessionId,
      url: sessionData.widgetUrl, // E2E test looks for url
      widgetUrl: sessionData.widgetUrl,
      expiresAt: sessionData.expiresAt,
      providers: sessionData.providers,
      referenceId: sessionData.referenceId,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Terra widget session error:', error)
    return res.status(500).json({
      error: 'Failed to create Terra widget session',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}