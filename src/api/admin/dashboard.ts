import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

interface AdminDashboardData {
  system: {
    uptime: string
    version: string
    environment: string
    timestamp: string
  }
  sessions: {
    activeSessions: number
    totalToday: number
    peakConcurrent: number
    averageDuration: number
  }
  database: {
    connectionStats: any
    performance: any
  }
  auth: {
    activeUsers: number
    totalTokens: number
  }
}

/**
 * @openapi
 * /api/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard metrics
 *     description: Retrieves system, session, database, and authentication metrics for administrative overview.
 *     tags:
 *       - Admin
 *     responses:
 *       200:
 *         description: Admin dashboard data successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 system:
 *                   type: object
 *                   properties:
 *                     uptime:
 *                       type: string
 *                     version:
 *                       type: string
 *                     environment:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                 sessions:
 *                   type: object
 *                   properties:
 *                     activeSessions:
 *                       type: number
 *                     totalToday:
 *                       type: number
 *                     peakConcurrent:
 *                       type: number
 *                     averageDuration:
 *                       type: number
 *                 database:
 *                   type: object
 *                   properties:
 *                     connectionStats:
 *                       type: object
 *                     performance:
 *                       type: object
 *                 auth:
 *                   type: object
 *                   properties:
 *                     activeUsers:
 *                       type: number
 *                     totalTokens:
 *                       type: number
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Server error
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const dbPool = DatabasePool.getInstance()

  try {
    // System metrics
    const dashboardData: AdminDashboardData = {
      system: {
        uptime: Math.floor(process.uptime()).toString() + 's',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      },
      sessions: {
        activeSessions: 0,
        totalToday: 0,
        peakConcurrent: 0,
        averageDuration: 0
      },
      database: {
        connectionStats: {
          totalCount: dbPool.totalCount,
          idleCount: dbPool.idleCount,
          waitingCount: dbPool.waitingCount
        },
        performance: await getDatabasePerformance()
      },
      auth: {
        activeUsers: 0,
        totalTokens: 0
      }
    }

    // Get session metrics
    const client = await DatabasePool.getClient();
    try {
      const activeSessionsQuery = await client.query(`
        SELECT COUNT(*) as count
        FROM user_sessions 
        WHERE last_activity > NOW() - INTERVAL '1 hour'
      `)
      dashboardData.sessions.activeSessions = parseInt(activeSessionsQuery.rows[0]?.count || '0')

      const todaySessionsQuery = await client.query(`
        SELECT COUNT(*) as count
        FROM user_sessions 
        WHERE created_at > CURRENT_DATE
      `)
      dashboardData.sessions.totalToday = parseInt(todaySessionsQuery.rows[0]?.count || '0')

      const avgDurationQuery = await client.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (last_activity - created_at))/60) as avg_minutes
        FROM user_sessions 
        WHERE created_at > CURRENT_DATE
      `)
      dashboardData.sessions.averageDuration = parseFloat(avgDurationQuery.rows[0]?.avg_minutes || '0')

      const activeUsersQuery = await client.query(`
        SELECT COUNT(DISTINCT user_email) as count
        FROM user_sessions 
        WHERE last_activity > NOW() - INTERVAL '1 hour'
      `)
      dashboardData.auth.activeUsers = parseInt(activeUsersQuery.rows[0]?.count || '0')
    } catch (error) {
      console.log('Session metrics tables not yet created:', error)
    } finally {
      client.release()
    }

    res.status(200).json(dashboardData)
  } catch (error) {
    console.error('Admin dashboard error:', error)
    res.status(500).json({
      error: 'Failed to generate dashboard data',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function getDatabasePerformance() {
  const client = await DatabasePool.getClient()
  
  try {
    const statsQuery = await client.query(`
      SELECT 
        schemaname,
        tablename,
        n_live_tup as live_tuples
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY n_live_tup DESC
      LIMIT 5
    `)

    return {
      tableStats: statsQuery.rows,
      connectionLimits: {
        maxConnections: await getMaxConnections(),
        currentConnections: await getCurrentConnections()
      }
    }
  } catch (error) {
    return {
      tableStats: [],
      connectionLimits: { maxConnections: 'unknown', currentConnections: 'unknown' }
    }
  } finally {
    client.release()
  }
}

async function getMaxConnections() {
  const client = await DatabasePool.getClient()
  try {
    const result = await client.query('SHOW max_connections')
    return result.rows[0]?.max_connections || 'unknown'
  } catch {
    return 'unknown'
  } finally {
    client.release()
  }
}

async function getCurrentConnections() {
  const client = await DatabasePool.getClient()
  try {
    const result = await client.query(`
      SELECT COUNT(*) as count 
      FROM pg_stat_activity 
      WHERE state = 'active'
    `)
    return result.rows[0]?.count || 'unknown'
  } catch {
    return 'unknown'
  } finally {
    client.release()
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}