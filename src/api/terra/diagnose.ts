/**
 * Terra API Diagnostic Endpoint
 * Provides detailed debugging information about Terra API connections and data availability
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { terraClient } from '../../lib/terra-client';
import { WearablesDatabase } from '../../lib/wearables-database';
import { validateSessionToken } from '../../lib/auth-database';

interface DiagnosticResponse {
  success: boolean;
  data?: {
    connections: any[];
    diagnostics: Record<string, any>;
  };
  message?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DiagnosticResponse>
) {
  if (req.method !== 'GET') {
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

    // Get user's wearable connections
    const connections = await WearablesDatabase.getUserConnections(user.id);

    if (connections.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          connections: [],
          diagnostics: {}
        },
        message: 'No wearable devices connected'
      });
    }

    console.log(`🔍 Diagnosing ${connections.length} devices for ${user.email}`);

    const diagnostics: Record<string, any> = {};

    // Test each connection
    for (const connection of connections) {
      console.log(`🔍 Diagnosing ${connection.provider} (${connection.terra_user_id})`);
      
      const providerDiagnostics = {
        provider: connection.provider,
        terra_user_id: connection.terra_user_id,
        connected_at: connection.connected_at,
        last_sync: connection.last_sync,
        scopes: connection.scopes,
        user_info: null as any,
        data_availability: {
          daily: { status: 'unknown', error: null as string | null, sample_response: null as any },
          sleep: { status: 'unknown', error: null as string | null, sample_response: null as any },
          body: { status: 'unknown', error: null as string | null, sample_response: null as any },
          activity: { status: 'unknown', error: null as string | null, sample_response: null as any }
        }
      };

      // Test user info endpoint
      try {
        const userInfo = await terraClient.getUser(connection.terra_user_id);
        providerDiagnostics.user_info = userInfo;
      } catch (error) {
        providerDiagnostics.user_info = { error: (error as Error).message } as any;
      }

      // Test different data endpoints with a single day
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Test daily data
      try {
        const response = await fetch(
          `https://api.tryterra.co/v2/daily?user_id=${connection.terra_user_id}&start_date=${yesterday}&end_date=${today}&to_webhook=false`,
          {
            headers: {
              'dev-id': process.env.TERRA_DEV_ID!,
              'x-api-key': process.env.TERRA_API_KEY!,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          providerDiagnostics.data_availability.daily = {
            status: 'success',
            error: null,
            sample_response: {
              data_count: data.data?.length || 0,
              sample: data.data?.[0] || null
            } as any
          };
        } else {
          const errorText = await response.text();
          providerDiagnostics.data_availability.daily = {
            status: 'error',
            error: `${response.status}: ${errorText}`,
            sample_response: null as any
          };
        }
      } catch (error) {
        providerDiagnostics.data_availability.daily = {
          status: 'error',
          error: (error as Error).message,
          sample_response: null
        };
      }

      // Test sleep data
      try {
        const response = await fetch(
          `https://api.tryterra.co/v2/sleep?user_id=${connection.terra_user_id}&start_date=${yesterday}&end_date=${today}&to_webhook=false`,
          {
            headers: {
              'dev-id': process.env.TERRA_DEV_ID!,
              'x-api-key': process.env.TERRA_API_KEY!,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          providerDiagnostics.data_availability.sleep = {
            status: 'success',
            error: null,
            sample_response: {
              data_count: data.data?.length || 0,
              sample: data.data?.[0] || null
            }
          };
        } else {
          const errorText = await response.text();
          providerDiagnostics.data_availability.sleep = {
            status: 'error',
            error: `${response.status}: ${errorText}`,
            sample_response: null
          };
        }
      } catch (error) {
        providerDiagnostics.data_availability.sleep = {
          status: 'error',
          error: (error as Error).message,
          sample_response: null
        };
      }

      // Test activity data
      try {
        const response = await fetch(
          `https://api.tryterra.co/v2/activity?user_id=${connection.terra_user_id}&start_date=${yesterday}&end_date=${today}&to_webhook=false`,
          {
            headers: {
              'dev-id': process.env.TERRA_DEV_ID!,
              'x-api-key': process.env.TERRA_API_KEY!,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          providerDiagnostics.data_availability.activity = {
            status: 'success',
            error: null,
            sample_response: {
              data_count: data.data?.length || 0,
              sample: data.data?.[0] || null
            }
          };
        } else {
          const errorText = await response.text();
          providerDiagnostics.data_availability.activity = {
            status: 'error',
            error: `${response.status}: ${errorText}`,
            sample_response: null
          };
        }
      } catch (error) {
        providerDiagnostics.data_availability.activity = {
          status: 'error',
          error: (error as Error).message,
          sample_response: null
        };
      }

      diagnostics[connection.provider] = providerDiagnostics;
    }

    return res.status(200).json({
      success: true,
      data: {
        connections,
        diagnostics
      }
    });

  } catch (error) {
    console.error('Diagnostic error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to run diagnostics'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}