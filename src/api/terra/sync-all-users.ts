/**
 * @deprecated This endpoint is deprecated. Use /api/terra/sync with sync_type: 'all_users' instead.
 * See TERRA_API_CONSOLIDATION_MIGRATION_GUIDE.md for migration instructions.
 * 
 * Sync All Real Users with Terra Production Data
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { terraClient } from '../../lib/terra-client';
import { DatabasePool } from '../../lib/database-pool'
import { WearablesDatabase } from '../../lib/wearables-database'

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    console.log('🚀 Starting comprehensive Terra sync for all real users...');
    
    const results = [];
    const startTime = Date.now();

    // 1. Get all connected users from our database
    console.log('📋 Fetching all connected users from database...');
    const client = await DatabasePool.getClient();
    
    const connectionsResult = await client.query(`
      SELECT user_id, provider, terra_user_id, connected_at, last_sync, scopes, is_active
      FROM wearable_connections 
      WHERE is_active = true
    `);
    
    const allConnections = connectionsResult.rows;
    client.release();
    console.log(`Found ${allConnections.length} total connections`);

    for (const connection of allConnections) {
      const userResult: {
        userId: string;
        provider: string;
        terraUserId: string;
        syncResults: Array<{
          type: string;
          success: boolean;
          dataCount?: number;
          dateRange?: string;
          error?: string;
        }>;
      } = {
        userId: connection.user_id,
        provider: connection.provider,
        terraUserId: connection.terra_user_id,
        syncResults: []
      };

      console.log(`🔄 Syncing user ${connection.user_id} with ${connection.provider}...`);

      try {
        // Get date range for sync (last 30 days)
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Sync activity data
        try {
          const activityData = await terraClient.getActivity(
            connection.terra_user_id,
            startDate,
            endDate
          );
          
          // Store in our database
          for (const activity of activityData) {
            await WearablesDatabase.saveHealthData(
              connection.user_id,
              connection.provider,
              'daily_comprehensive',
              activity,
              new Date(activity.summary_date)
            );
          }
          
          userResult.syncResults.push({
            type: 'activity',
            success: true,
            dataCount: activityData.length,
            dateRange: `${startDate} to ${endDate}`
          });
          console.log(`✅ Activity sync: ${activityData.length} records`);
        } catch (error) {
          userResult.syncResults.push({
            type: 'activity',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Sync sleep data
        try {
          const sleepData = await terraClient.getSleep(
            connection.terra_user_id,
            startDate,
            endDate
          );
          
          for (const sleep of sleepData) {
            await WearablesDatabase.saveHealthData(
              connection.user_id,
              connection.provider,
              'sleep_comprehensive',
              sleep,
              new Date(sleep.summary_date)
            );
          }
          
          userResult.syncResults.push({
            type: 'sleep',
            success: true,
            dataCount: sleepData.length,
            dateRange: `${startDate} to ${endDate}`
          });
          console.log(`✅ Sleep sync: ${sleepData.length} records`);
        } catch (error) {
          userResult.syncResults.push({
            type: 'sleep',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Sync heart rate data
        try {
          const heartRateData = await terraClient.getHeartRateData(
            connection.terra_user_id,
            startDate,
            endDate
          );
          
          for (const heartRate of heartRateData) {
            await WearablesDatabase.saveHealthData(
              connection.user_id,
              connection.provider,
              'heart_rate_comprehensive',
              heartRate,
              new Date(heartRate.summary_date)
            );
          }
          
          userResult.syncResults.push({
            type: 'heart_rate',
            success: true,
            dataCount: heartRateData.length,
            dateRange: `${startDate} to ${endDate}`
          });
          console.log(`✅ Heart rate sync: ${heartRateData.length} records`);
        } catch (error) {
          userResult.syncResults.push({
            type: 'heart_rate',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Sync body data
        try {
          const bodyData = await terraClient.getBody(
            connection.terra_user_id,
            startDate,
            endDate
          );
          
          for (const body of bodyData) {
            await WearablesDatabase.saveHealthData(
              connection.user_id,
              connection.provider,
              'body_comprehensive',
              body,
              new Date(body.summary_date)
            );
          }
          
          userResult.syncResults.push({
            type: 'body',
            success: true,
            dataCount: bodyData.length,
            dateRange: `${startDate} to ${endDate}`
          });
          console.log(`✅ Body sync: ${bodyData.length} records`);
        } catch (error) {
          userResult.syncResults.push({
            type: 'body',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Update last sync timestamp
        await WearablesDatabase.updateLastSync(connection.user_id, connection.provider);
        
      } catch (error) {
        console.error(`❌ Error syncing user ${connection.user_id}:`, error);
        userResult.syncResults.push({
          type: 'user_sync_error',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      results.push(userResult);
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`🎯 Terra sync complete! Processed ${allConnections.length} users in ${duration}s`);

    // Summary statistics
    const totalSyncOperations = results.reduce((total, user) => total + user.syncResults.length, 0);
    const successfulSyncs = results.reduce((total, user) => 
      total + user.syncResults.filter(sync => sync.success).length, 0
    );
    const totalDataPoints = results.reduce((total, user) =>
      total + user.syncResults.reduce((userTotal, sync) => 
        userTotal + (sync.dataCount || 0), 0
      ), 0
    );

    return res.status(200).json({
      success: true,
      message: 'All users synced with Terra production data',
      timestamp: new Date().toISOString(),
      duration: `${duration}s`,
      environment: 'PRODUCTION',
      summary: {
        totalUsers: allConnections.length,
        totalSyncOperations: totalSyncOperations,
        successfulSyncs: successfulSyncs,
        totalDataPoints: totalDataPoints,
        successRate: `${((successfulSyncs / totalSyncOperations) * 100).toFixed(1)}%`
      },
      userResults: results
    });

  } catch (error) {
    console.error('Terra sync all users error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}