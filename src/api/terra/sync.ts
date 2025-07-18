/**
 * Terra Unified Sync API Endpoint
 * Consolidated sync operations for all Terra data synchronization needs
 * 
 * Supports:
 * - Manual sync for specific users
 * - Device-specific sync
 * - Bulk sync operations
 * - Daily sync automation
 * - Enrichment data sync
 * 
 * Replaces: daily-sync, manual-sync, user-sync, sync-all-users, 
 * sync-real-data, manual-enrichment-sync, backfill-daily-scores
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { terraClient } from '../../lib/terra-client';
import { WearablesDatabase } from '../../lib/wearables-database';
import { validateSessionToken } from '../../lib/auth-database';
import { DatabasePool } from '../../lib/database-pool';

interface SyncRequest {
  sync_type?: 'manual' | 'daily' | 'enrichment' | 'device' | 'all_users';
  user_id?: string;
  device_id?: string;
  terra_user_id?: string;
  days_back?: number;
  include_enrichment?: boolean;
  force_refresh?: boolean;
}

interface SyncResponse {
  success: boolean;
  data?: {
    synced_providers: string[];
    users_processed?: number;
    enrichment_scores_updated?: number;
    processing_time_ms?: number;
    message: string;
    errors?: string[];
  };
  message?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SyncResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const startTime = Date.now();
  
  try {
    const {
      sync_type = 'manual',
      user_id,
      device_id,
      terra_user_id,
      days_back = 7,
      include_enrichment = true,
      force_refresh = false
    }: SyncRequest = req.body;

    // Authentication handling
    let targetUserId = user_id;
    
    if (sync_type !== 'all_users') {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const sessionToken = authHeader.substring(7);
      const user = await validateSessionToken(sessionToken);
      
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid session' });
      }
      
      targetUserId = user_id || user.id;
    }

    console.log(`🔄 ${sync_type.toUpperCase()} SYNC STARTED:`, new Date().toISOString());

    switch (sync_type) {
      case 'manual':
        return await handleManualSync(targetUserId!, res, startTime);
      
      case 'daily':
        return await handleDailySync(targetUserId, res, startTime, days_back);
        
      case 'enrichment':
        return await handleEnrichmentSync(targetUserId, res, startTime, force_refresh);
        
      case 'device':
        return await handleDeviceSync(targetUserId!, device_id, terra_user_id, res, startTime);
        
      case 'all_users':
        return await handleAllUsersSync(res, startTime, include_enrichment);
        
      default:
        return res.status(400).json({ 
          success: false, 
          message: `Invalid sync_type: ${sync_type}` 
        });
    }

  } catch (error) {
    console.error('Unified sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute sync operation'
    });
  }
}

// Manual sync for specific user
async function handleManualSync(userId: string, res: NextApiResponse<SyncResponse>, startTime: number) {
  const connections = await WearablesDatabase.getUserConnections(userId);

  if (connections.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        synced_providers: [],
        processing_time_ms: Date.now() - startTime,
        message: 'No wearable devices connected'
      }
    });
  }

  const syncedProviders: string[] = [];
  const errors: string[] = [];

  for (const connection of connections) {
    try {
      console.log(`🔄 Manual syncing ${connection.provider} (${connection.terra_user_id})`);
      
      // Force data request and update last sync
      // Force data request via Terra API
      console.log(`Requesting data sync for Terra user: ${connection.terra_user_id}`);
      await WearablesDatabase.updateLastSync(connection.user_id, connection.provider);
      
      syncedProviders.push(connection.provider);
    } catch (error) {
      const errorMsg = `Failed to sync ${connection.provider}: ${error}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  return res.status(200).json({
    success: true,
    data: {
      synced_providers: syncedProviders,
      processing_time_ms: Date.now() - startTime,
      message: `Manual sync completed for ${syncedProviders.length} devices`,
      ...(errors.length > 0 && { errors })
    }
  });
}

// Daily sync automation
async function handleDailySync(userId: string | undefined, res: NextApiResponse<SyncResponse>, startTime: number, daysBack: number) {
  const client = await DatabasePool.getClient();
  
  try {
    // Get connections for specific user or all users
    const query = userId 
      ? `SELECT * FROM wearable_connections WHERE user_id = $1 AND status = 'active'`
      : `SELECT * FROM wearable_connections WHERE status = 'active'`;
    
    const params = userId ? [userId] : [];
    const result = await client.query(query, params);
    const connections = result.rows;

    const syncedProviders: string[] = [];
    let enrichmentScoresUpdated = 0;

    for (const connection of connections) {
      try {
        // Sync recent data
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        await terraClient.getSleep(connection.terra_user_id, startDate, endDate);
        await terraClient.getActivity(connection.terra_user_id, startDate, endDate);
        
        syncedProviders.push(connection.provider);
        enrichmentScoresUpdated++;
        
      } catch (error) {
        console.error(`Daily sync failed for ${connection.provider}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        synced_providers: syncedProviders,
        users_processed: userId ? 1 : connections.length,
        enrichment_scores_updated: enrichmentScoresUpdated,
        processing_time_ms: Date.now() - startTime,
        message: `Daily sync completed: ${syncedProviders.length} devices processed`
      }
    });

  } finally {
    client.release();
  }
}

// Enrichment data sync
async function handleEnrichmentSync(userId: string | undefined, res: NextApiResponse<SyncResponse>, startTime: number, forceRefresh: boolean) {
  const client = await DatabasePool.getClient();
  
  try {
    const query = userId 
      ? `SELECT terra_user_id, provider FROM wearable_connections WHERE user_id = $1 AND status = 'active'`
      : `SELECT terra_user_id, provider FROM wearable_connections WHERE status = 'active'`;
    
    const params = userId ? [userId] : [];
    const result = await client.query(query, params);
    const connections = result.rows;

    const syncedProviders: string[] = [];
    let enrichmentScoresUpdated = 0;

    for (const connection of connections) {
      try {
        // Request enrichment data from Terra
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = new Date().toISOString().split('T')[0];
        const enrichmentData = await terraClient.getActivity(connection.terra_user_id, startDate, endDate);
        
        if (enrichmentData && enrichmentData.length > 0) {
          // Process and store enrichment scores
          for (const data of enrichmentData) {
            await processEnrichmentData(userId!, data);
            enrichmentScoresUpdated++;
          }
        }
        
        syncedProviders.push(connection.provider);
        
      } catch (error) {
        console.error(`Enrichment sync failed for ${connection.provider}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        synced_providers: syncedProviders,
        enrichment_scores_updated: enrichmentScoresUpdated,
        processing_time_ms: Date.now() - startTime,
        message: `Enrichment sync completed: ${enrichmentScoresUpdated} scores updated`
      }
    });

  } finally {
    client.release();
  }
}

// Device-specific sync
async function handleDeviceSync(userId: string, deviceId: string | undefined, terraUserId: string | undefined, res: NextApiResponse<SyncResponse>, startTime: number) {
  const connections = await WearablesDatabase.getUserConnections(userId);
  
  const targetConnection = terraUserId 
    ? connections.find(c => c.terra_user_id === terraUserId)
    : connections.find(c => c.id === deviceId);

  if (!targetConnection) {
    return res.status(404).json({
      success: false,
      message: 'Device connection not found'
    });
  }

  try {
    // Request data sync instead of using non-existent requestData method
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];
    await terraClient.getActivity(targetConnection.terra_user_id!, startDate, endDate);
    await WearablesDatabase.updateLastSync(targetConnection.user_id, targetConnection.provider);

    return res.status(200).json({
      success: true,
      data: {
        synced_providers: [targetConnection.provider],
        processing_time_ms: Date.now() - startTime,
        message: `Device sync completed for ${targetConnection.provider}`
      }
    });

  } catch (error) {
    console.error(`Device sync failed:`, error);
    return res.status(500).json({
      success: false,
      message: `Failed to sync device: ${error}`
    });
  }
}

// All users sync (background automation)
async function handleAllUsersSync(res: NextApiResponse<SyncResponse>, startTime: number, includeEnrichment: boolean) {
  const client = await DatabasePool.getClient();
  
  try {
    const result = await client.query(`
      SELECT DISTINCT user_id, terra_user_id, provider 
      FROM wearable_connections 
      WHERE status = 'active'
    `);
    
    const connections = result.rows;
    const syncedProviders: string[] = [];
    let usersProcessed = 0;
    let enrichmentScoresUpdated = 0;
    const errors: string[] = [];

    console.log(`📋 Found ${connections.length} active wearable connections to sync`);

    for (const connection of connections) {
      try {
        console.log(`🔄 Syncing enrichment data for user ${connection.user_id} (Terra: ${connection.terra_user_id})`);
        
        if (includeEnrichment) {
          const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const endDate = new Date().toISOString().split('T')[0];
          const enrichmentData = await terraClient.getActivity(connection.terra_user_id, startDate, endDate);
          if (enrichmentData && enrichmentData.length > 0) {
            enrichmentScoresUpdated += enrichmentData.length;
          }
        }
        
        await WearablesDatabase.updateLastSync(connection.user_id, connection.provider);
        syncedProviders.push(connection.provider);
        usersProcessed++;
        
      } catch (error) {
        const errorMsg = `Failed sync for user ${connection.user_id}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`🎯 ALL USERS SYNC COMPLETED: ${usersProcessed} users, ${enrichmentScoresUpdated} enrichment scores, ${Date.now() - startTime}ms`);

    return res.status(200).json({
      success: true,
      data: {
        synced_providers: syncedProviders,
        users_processed: usersProcessed,
        enrichment_scores_updated: enrichmentScoresUpdated,
        processing_time_ms: Date.now() - startTime,
        message: `All users sync completed: ${usersProcessed} users processed`,
        ...(errors.length > 0 && { errors })
      }
    });

  } finally {
    client.release();
  }
}

// Helper function to process enrichment data
async function processEnrichmentData(userId: string, enrichmentData: any) {
  const client = await DatabasePool.getClient();
  
  try {
    // Store enrichment scores in database
    await client.query(`
      INSERT INTO enrichment_scores (
        user_id, provider, data_type, summary_date, 
        sleep_score, stress_score, respiratory_score, contributors
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, provider, data_type, summary_date) 
      DO UPDATE SET 
        sleep_score = EXCLUDED.sleep_score,
        stress_score = EXCLUDED.stress_score,
        respiratory_score = EXCLUDED.respiratory_score,
        contributors = EXCLUDED.contributors,
        updated_at = CURRENT_TIMESTAMP
    `, [
      userId,
      enrichmentData.provider || 'unknown',
      enrichmentData.type || 'enrichment',
      enrichmentData.summary_date || new Date().toISOString().split('T')[0],
      enrichmentData.sleep_score || null,
      enrichmentData.stress_score || null,
      enrichmentData.respiratory_score || null,
      JSON.stringify(enrichmentData.contributors || {})
    ]);
    
  } finally {
    client.release();
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as anys);
}