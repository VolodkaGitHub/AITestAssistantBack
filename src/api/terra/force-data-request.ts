/**
 * Terra Force Data Request
 * Manually requests Terra to send webhook data for all users
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

const dbPool = DatabasePool.getInstance();

const TERRA_API_KEY = process.env.TERRA_API_KEY_PROD;
const TERRA_DEV_ID = process.env.TERRA_DEV_ID_PROD;

interface DataRequestResult {
  success: boolean;
  users_processed: number;
  requests_sent: number;
  data_types_requested: string[];
  errors: string[];
  processing_time_ms: number;
}

async function requestTerraDataWithWebhook(terraUserId: string, dataType: string, startDate: string, endDate: string) {
  try {
    const url = `https://api.tryterra.co/v2/${dataType}?user_id=${terraUserId}&start_date=${startDate}&end_date=${endDate}&to_webhook=true`;
    
    console.log(`📤 Requesting Terra ${dataType} data with webhook:`, {
      terraUserId,
      dataType,
      dateRange: `${startDate} to ${endDate}`,
      webhook: true
    });

    const response = await fetch(url, {
      headers: {
        'dev-id': TERRA_DEV_ID!,
        'x-api-key': TERRA_API_KEY!,
      }
    });

    if (!response.ok) {
      console.log(`❌ Terra API error: ${response.status} ${response.statusText}`);
      return { success: false, error: `${response.status} ${response.statusText}` };
    }

    const data = await response.json();
    console.log(`✅ Terra ${dataType} webhook request sent:`, {
      status: data.status,
      message: data.message || 'Data request queued'
    });

    return { success: true, data };
  } catch (error) {
    console.error(`Error requesting Terra ${dataType}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DataRequestResult>
) {
  const startTime = Date.now();
  
  console.log('🚀 TERRA FORCE DATA REQUEST INITIATED:', new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      users_processed: 0,
      requests_sent: 0,
      data_types_requested: [],
      errors: ['Method not allowed'],
      processing_time_ms: Date.now() - startTime
    });
  }

  try {
    // Get all active wearable connections
    const connectionsQuery = `
      SELECT user_id, terra_user_id, provider 
      FROM wearable_connections 
      WHERE is_active = true AND terra_user_id IS NOT NULL
    `;
    
    const connectionsResult = await dbPool.query(connectionsQuery);
    const connections = connectionsResult.rows;

    console.log(`📋 Found ${connections.length} active connections to request data for`);

    // Date range: last 30 days to ensure we get recent enrichment data
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dataTypes = ['daily', 'sleep', 'activity', 'body'];
    const errors: string[] = [];
    let totalRequests = 0;

    // Process each user and request all data types with webhook delivery
    for (const connection of connections) {
      const { user_id: userId, terra_user_id: terraUserId, provider } = connection;
      
      console.log(`🔄 Processing data requests for user ${userId} (Terra: ${terraUserId})`);

      for (const dataType of dataTypes) {
        try {
          const result = await requestTerraDataWithWebhook(terraUserId, dataType, startDate, endDate);
          
          if (result.success) {
            totalRequests++;
            console.log(`✅ Successfully requested ${dataType} data for user ${userId}`);
          } else {
            const errorMsg = `Failed to request ${dataType} for user ${userId}: ${result.error}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          const errorMsg = `Error requesting ${dataType} for user ${userId}: ${error}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }
    }

    const processingTime = Date.now() - startTime;

    console.log(`🎯 FORCE DATA REQUEST COMPLETED:`, {
      usersProcessed: connections.length,
      requestsSent: totalRequests,
      dataTypesRequested: dataTypes,
      errors: errors.length,
      processingTimeMs: processingTime
    });

    return res.status(200).json({
      success: true,
      users_processed: connections.length,
      requests_sent: totalRequests,
      data_types_requested: dataTypes,
      errors,
      processing_time_ms: processingTime
    });

  } catch (error) {
    console.error('Force data request error:', error);
    return res.status(500).json({
      success: false,
      users_processed: 0,
      requests_sent: 0,
      data_types_requested: [],
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      processing_time_ms: Date.now() - startTime
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}