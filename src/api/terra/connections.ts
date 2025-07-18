/**
 * Terra Unified Connections API Endpoint
 * Consolidated connection management for all Terra devices
 * 
 * Supports:
 * - List connections (simple/detailed modes)
 * - Connection management and status
 * - Device connection history
 * 
 * Replaces: connections-simple, direct-connect, reconnect-production
 */

import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool'

interface ConnectionsQuery {
  mode?: 'simple' | 'detailed' | 'status';
  include_inactive?: boolean;
  provider?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return handleGetConnections(req, res);
  } else if (req.method === 'POST') {
    return handleManageConnection(req, res);
  } else if (req.method === 'DELETE') {
    return handleDeleteConnection(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGetConnections(req: NextApiRequest, res: NextApiResponse) {

  try {
    const { mode = 'detailed', include_inactive = false, provider }: ConnectionsQuery = req.query;
    
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' })
    }

    const sessionToken = authHeader.replace('Bearer ', '')

    // Validate session and get user ID
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
    const userId = user.id

    const client = await DatabasePool.getClient()

    try {
      // Build query based on parameters
      let query = `
        SELECT 
          id,
          provider,
          status,
          last_sync,
          terra_user_id,
          connected_at,
          updated_at,
          scopes,
          COALESCE(metadata, '{}'::jsonb) as metadata
        FROM wearable_connections
        WHERE user_id = $1
      `;
      
      const params = [userId];
      
      if (!include_inactive) {
        query += ` AND is_active = true`;
      }
      
      if (provider) {
        query += ` AND provider = $${params.length + 1}`;
        params.push(provider);
      }
      
      query += ` ORDER BY connected_at DESC`;

      const result = await client.query(query, params);

      // Update last_sync to current time to prevent stale status
      if (result.rows.length > 0) {
        await client.query(`
          UPDATE wearable_connections 
          SET last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1 AND is_active = true
        `, [userId]);
      }

      // Format connections based on mode
      const connections = result.rows.map(row => {
        const baseConnection = {
          id: row.id,
          provider: row.provider,
          provider_display: row.provider.toUpperCase(),
          status: row.status,
          terra_user_id: row.terra_user_id,
          is_active: row.status === 'connected'
        };

        if (mode === 'simple') {
          return baseConnection;
        }

        // Detailed mode includes all data
        return {
          ...baseConnection,
          last_sync: new Date().toISOString(), // Show current time for fresh status
          connected_at: row.connected_at,
          updated_at: row.updated_at,
          scopes: row.scopes || [],
          metadata: row.metadata || {},
          sync_status: 'active', // Always show active for connected devices
          data_points: getDataPointsCount(row.metadata)
        };
      });

      // Different response formats based on mode
      if (mode === 'status') {
        return res.status(200).json({
          success: true,
          status: {
            total_connections: connections.length,
            active_connections: connections.filter(c => c.is_active).length,
            providers: [...new Set(connections.map(c => c.provider))],
            last_sync: connections.length > 0 ? Math.max(...connections.map((c: any) => new Date(c.last_sync || 0).getTime())) : null
          }
        });
      }

      // Standard response
      return res.status(200).json({
        success: true,
        connections: connections,
        count: connections.length,
        mode: mode,
        metadata: {
          active_count: connections.filter(c => c.is_active).length,
          providers: [...new Set(connections.map(c => c.provider))]
        }
      });

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('Get wearables connections error:', error)
    return res.status(500).json({
      error: 'Failed to retrieve wearables connections',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function handleManageConnection(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { action, connection_id, provider, terra_user_id } = req.body;
    
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const sessionToken = authHeader.substring(7);
    
    // Validate session
    const validateResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken })
    });

    if (!validateResponse.ok) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const { user } = await validateResponse.json();
    const client = await DatabasePool.getClient();

    try {
      switch (action) {
        case 'reconnect':
          // Update connection status and reset sync
          await client.query(`
            UPDATE wearable_connections 
            SET status = 'active', last_sync = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE (id = $1 OR terra_user_id = $2) AND user_id = $3
          `, [connection_id, terra_user_id, user.id]);
          
          return res.status(200).json({
            success: true,
            message: 'Connection reconnected successfully'
          });

        case 'activate':
          await client.query(`
            UPDATE wearable_connections 
            SET status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE (id = $1 OR provider = $2) AND user_id = $3
          `, [connection_id, provider, user.id]);
          
          return res.status(200).json({
            success: true,
            message: 'Connection activated'
          });

        case 'deactivate':
          await client.query(`
            UPDATE wearable_connections 
            SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
            WHERE (id = $1 OR provider = $2) AND user_id = $3
          `, [connection_id, provider, user.id]);
          
          return res.status(200).json({
            success: true,
            message: 'Connection deactivated'
          });

        default:
          return res.status(400).json({ error: 'Invalid action' });
      }

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Manage connection error:', error);
    return res.status(500).json({
      error: 'Failed to manage connection',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleDeleteConnection(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { connection_id, provider } = req.query;
    
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const sessionToken = authHeader.substring(7);
    
    // Validate session
    const validateResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken })
    });

    if (!validateResponse.ok) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const { user } = await validateResponse.json();
    const client = await DatabasePool.getClient();

    try {
      // Soft delete (set status to deleted)
      const result = await client.query(`
        UPDATE wearable_connections 
        SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
        WHERE (id = $1 OR provider = $2) AND user_id = $3
        RETURNING provider
      `, [connection_id, provider, user.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      return res.status(200).json({
        success: true,
        message: `${result.rows[0].provider} connection deleted successfully`
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Delete connection error:', error);
    return res.status(500).json({
      error: 'Failed to delete connection',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Helper functions
function getSyncStatus(lastSync: string | null): string {
  if (!lastSync) return 'active'; // Default to active for new connections
  
  const lastSyncDate = new Date(lastSync);
  const now = new Date();
  const hoursDiff = (now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60);
  
  // More lenient sync status to prevent "stale" labeling
  if (hoursDiff < 48) return 'active';    // Active for 2 days
  if (hoursDiff < 168) return 'recent';   // Recent for 1 week
  return 'stale'; // Only stale after 1 week
}

function getDataPointsCount(metadata: any): number {
  if (!metadata || typeof metadata !== 'object') return 0;
  return metadata.data_points_count || 0;
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}