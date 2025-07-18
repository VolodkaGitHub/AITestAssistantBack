/**
 * @deprecated This endpoint is deprecated. Use /api/terra/sync with sync_type: 'manual' instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Terra Manual Sync API
 * Triggers manual data sync and webhook generation for testing
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { authDB } from '../../lib/auth-database';
import { DatabasePool } from '../../lib/database-pool'

const dbPool = DatabasePool.getInstance();

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Validate user session
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionToken) {
      return res.status(401).json({ message: 'No session token provided' });
    }

    await authDB.initializeSchema();
    const sessionData = await authDB.validateSession(sessionToken);
    if (!sessionData) {
      return res.status(401).json({ message: 'Invalid session' });
    }

    const userId = sessionData.id;
    console.log(`🔄 Starting manual sync for user: ${userId}`);

    // Get user's Terra connections
    const connectionsQuery = `
      SELECT terra_user_id, provider 
      FROM wearable_connections 
      WHERE user_id = $1 AND is_active = true
    `;
    const connectionsResult = await dbPool.query(connectionsQuery, [userId]);

    if (connectionsResult.rows.length === 0) {
      return res.status(200).json({ 
        success: false, 
        message: 'No active Terra connections found' 
      });
    }

    const terraApiKey = process.env.TERRA_API_KEY_PROD;
    const terraDevId = process.env.TERRA_DEV_ID_PROD;
    
    if (!terraApiKey || !terraDevId) {
      return res.status(500).json({ 
        success: false, 
        message: 'Missing Terra production credentials' 
      });
    }

    const syncResults = [];

    for (const connection of connectionsResult.rows) {
      const { terra_user_id, provider } = connection;
      
      console.log(`🔄 Triggering manual sync for Terra user: ${terra_user_id} (${provider})`);

      try {
        // Request historical data which triggers webhook processing
        const dataTypes = ['sleep', 'daily', 'activity', 'body'];
        
        for (const dataType of dataTypes) {
          // Calculate date range (last 7 days)
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          
          const formattedStartDate = startDate.toISOString().split('T')[0];
          const formattedEndDate = endDate.toISOString().split('T')[0];

          const endpoint = `https://api.tryterra.co/v2/${dataType}`;
          const url = `${endpoint}?user_id=${terra_user_id}&start_date=${formattedStartDate}&end_date=${formattedEndDate}&to_webhook=true`;
          
          console.log(`📡 Requesting ${dataType} data to webhook:`, { terra_user_id, provider, url });

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'dev-id': terraDevId,
              'X-API-Key': terraApiKey,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            console.error(`❌ Terra API error for ${dataType}:`, response.status, response.statusText);
            continue;
          }

          const data = await response.json();
          console.log(`📊 Terra ${dataType} webhook request result:`, {
            user: data.user?.user_id,
            status: data.status || 'queued',
            message: data.message || 'Data requested to webhook'
          });

          syncResults.push({
            terra_user_id,
            provider,
            data_type: dataType,
            status: data.status || 'queued',
            success: true
          });
        }

        // Also try to generate test data for this user
        console.log(`🎲 Attempting to generate test data for Terra user: ${terra_user_id}`);
        
        const generateResponse = await fetch('https://api.tryterra.co/v2/auth/generateTestData', {
          method: 'POST',
          headers: {
            'dev-id': terraDevId,
            'X-API-Key': terraApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            user_id: terra_user_id,
            data_types: ['sleep', 'daily', 'activity', 'body'],
            to_webhook: true
          })
        });

        if (generateResponse.ok) {
          const generateData = await generateResponse.json();
          console.log(`✅ Test data generation response:`, generateData);
          
          syncResults.push({
            terra_user_id,
            provider,
            data_type: 'test_data',
            status: 'generated',
            success: true
          });
        } else {
          console.log(`⚠️ Test data generation not available for ${terra_user_id}`);
        }

      } catch (error) {
        console.error(`❌ Error syncing ${terra_user_id}:`, error);
        syncResults.push({
          terra_user_id,
          provider,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log(`✅ Manual sync triggered for user ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Manual sync triggered - webhook data should arrive shortly',
      sync_results: syncResults,
      note: 'Check your webhook endpoint for incoming data within the next few minutes'
    });

  } catch (error) {
    console.error('Error in manual sync:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to trigger manual sync',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}