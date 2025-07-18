/**
 * Terra Connect API Endpoint
 * Generates authentication URLs for connecting wearable devices
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { terraClient } from '../../lib/terra-client';
import { validateSessionToken } from '../../lib/auth-database';

interface ConnectRequest {
  provider: string;
}

interface ConnectResponse {
  success: boolean;
  auth_url?: string;
  user_id?: string;
  message?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ConnectResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Validate user session
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const sessionToken = authHeader.substring(7);
    const user = await validateSessionToken(sessionToken);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid session' });
    }

    const { provider } = req.body as ConnectRequest;

    if (!provider) {
      return res.status(400).json({ success: false, message: 'Provider is required' });
    }

    // Validate provider
    const supportedProviders = terraClient.getSupportedProviders();
    if (!supportedProviders.includes(provider.toUpperCase())) {
      return res.status(400).json({ 
        success: false, 
        message: `Unsupported provider. Supported: ${supportedProviders.join(', ')}` 
      });
    }

    // Generate authentication URL - prioritize production domain detection
    let baseUrl = process.env.NEXTAUTH_URL;
    
    // If NEXTAUTH_URL not set, detect from request headers
    if (!baseUrl) {
      const host = req.headers.host;
      if (host?.includes('replit.app') || host?.includes('replit.dev')) {
        baseUrl = `https://${host}`;
      } else {
        // Fallback for development
        baseUrl = 'http://localhost:5000';
      }
    }
    
    // Ensure production domain override for known deployment
    if (req.headers.host?.includes('replit.app')) {
      baseUrl = `https://${req.headers.host}`;
    }
    
    const redirectUri = `${baseUrl}/api/terra/callback?popup=true`;
    const referenceId = `${user.email?.split('@')[0] || 'user'}-${provider.toLowerCase()}-${Date.now()}`; // Use email prefix for mapping
    
    console.log(`🔗 Terra auth redirect URI: ${redirectUri}`);

    const authData = await terraClient.generateAuthURL(
      provider.toUpperCase(),
      redirectUri,
      referenceId,
      baseUrl // Pass the dynamic base URL for webhook configuration
    );

    return res.status(200).json({
      success: true,
      auth_url: authData.auth_url,
      user_id: authData.user_id
    });

  } catch (error) {
    console.error('Terra connect error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}