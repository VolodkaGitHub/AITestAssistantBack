/**
 * Samsung Health Authentication Endpoint
 * Generates authentication tokens for Samsung Health SDK integration
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { validateSessionToken } from '../../lib/auth-database';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate user session
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.split(' ')[1];
    const user = await validateSessionToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid session token' });
    }

    // Generate Terra SDK authentication token for Samsung Health
    const terraResponse = await fetch(`${process.env.TERRA_API_URL || 'https://api.tryterra.co'}/v2/auth/generateAuthToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'dev-id': process.env.TERRA_DEV_ID_PROD!,
        'x-api-key': process.env.TERRA_API_KEY_PROD!,
      },
    });

    if (!terraResponse.ok) {
      const errorText = await terraResponse.text();
      console.error('Terra SDK token generation failed:', errorText);
      return res.status(500).json({ 
        error: 'Failed to generate Samsung Health authentication token',
        details: errorText
      });
    }

    const terraData = await terraResponse.json();
    
    console.log('🔐 Samsung Health SDK token generated:', {
      userId: user.id,
      email: user.email,
      tokenGenerated: !!terraData.token,
      expiresIn: terraData.expires_in
    });

    return res.status(200).json({
      success: true,
      data: {
        sdk_token: terraData.token,
        expires_in: terraData.expires_in,
        provider: 'SAMSUNG',
        user_reference: user.email?.split('@')[0] || user.id,
        instructions: {
          platform: 'Android SDK',
          minimum_version: 'Android SDK 28 (Pie)',
          samsung_health_version: '6.22.5+',
          integration_method: 'Health Connect API'
        }
      }
    });

  } catch (error) {
    console.error('Samsung Health authentication error:', error);
    return res.status(500).json({ 
      error: 'Internal server error generating Samsung Health token',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}