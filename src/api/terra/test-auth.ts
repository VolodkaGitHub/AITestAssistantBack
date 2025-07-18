import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { terraClient } from '../../lib/terra-client'

/**
 * Terra API Test Endpoint
 * Tests Terra authentication configuration and connectivity
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get the current domain for testing
    const host = req.headers.host
    const baseUrl = host?.includes('replit.app') || host?.includes('replit.dev') 
      ? `https://${host}` 
      : 'http://localhost:5000'
    
    console.log('🧪 Testing Terra API with:', {
      host,
      baseUrl,
      terraCredentials: {
        devId: process.env.TERRA_DEV_ID_PROD?.substring(0, 8) + '...',
        apiKeyLength: process.env.TERRA_API_KEY_PROD?.length,
        secretLength: process.env.TERRA_SECRET_PROD?.length
      }
    })

    // Test Terra generateAuthURL endpoint
    const testProvider = 'OURA'
    const redirectUri = `${baseUrl}/api/terra/callback?popup=true`
    const referenceId = `test-${Date.now()}`
    
    console.log('🔗 Testing Terra generateAuthURL with:', {
      provider: testProvider,
      redirectUri,
      referenceId,
      baseUrl
    })

    const authData = await terraClient.generateAuthURL(
      testProvider,
      redirectUri,
      referenceId,
      baseUrl
    )

    return res.status(200).json({
      success: true,
      test_results: {
        credentials_configured: true,
        api_response: authData,
        domain: host,
        redirect_uri: redirectUri,
        webhook_url: `${baseUrl}/api/terra/webhook-auth`
      }
    })

  } catch (error) {
    console.error('❌ Terra API test failed:', error)
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      test_results: {
        credentials_configured: !!(
          process.env.TERRA_API_KEY_PROD && 
          process.env.TERRA_DEV_ID_PROD && 
          process.env.TERRA_SECRET_PROD
        ),
        domain: req.headers.host,
        error_details: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3)
        } : null
      }
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}