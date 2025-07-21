/**
 * Wearables Context API for OpenAI Integration
 * Provides comprehensive wearable health data for AI chat context
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { WearablesDatabase } from '../../lib/wearables-database';
import { validateSessionToken } from '../../lib/auth-database';

interface WearablesContextResponse {
  success: boolean;
  wearables_context?: {
    has_wearables: boolean;
    summary: string;
    recent_metrics: {
      sleep?: string;
      activity?: string;
      heart_rate?: string;
      body?: string;
    };
    devices: string[];
  };
  message?: string;
}

/**
 * @openapi
 * /api/wearables/context:
 *   get:
 *     tags:
 *       - Wearables
 *     summary: Get wearable health data context for AI chat
 *     description: Provides summary and recent metrics from connected wearable devices for AI integration.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wearables context data returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 wearables_context:
 *                   type: object
 *                   properties:
 *                     has_wearables:
 *                       type: boolean
 *                       example: true
 *                     summary:
 *                       type: string
 *                       example: "Patient has 2 connected wearable devices: Fitbit, Apple Watch/Health. Recent health metrics: ..."
 *                     recent_metrics:
 *                       type: object
 *                       properties:
 *                         sleep:
 *                           type: string
 *                           example: "7.5 hours sleep (85% efficiency)"
 *                         activity:
 *                           type: string
 *                           example: "8,000 steps, 2300 calories, 5.2km"
 *                         heart_rate:
 *                           type: string
 *                           example: "72 bpm average (60 bpm resting)"
 *                         body:
 *                           type: string
 *                           example: "70kg, 18% body fat"
 *                     devices:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Fitbit", "Apple Watch/Health"]
 *       401:
 *         description: Authentication required or invalid session
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WearablesContextResponse>
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
        wearables_context: {
          has_wearables: false,
          summary: "No wearable devices connected. Patient has not shared any fitness or health tracking data.",
          recent_metrics: {},
          devices: []
        }
      });
    }

    // Get recent health data (last 3 days)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const recentData = await WearablesDatabase.getHealthData(user.id, undefined, threeDaysAgo);

    // Generate comprehensive health summary
    const healthSummary = await WearablesDatabase.getHealthSummary(user.id);

    // Extract recent metrics for AI context
    const recentMetrics: any = {};
    
    // Process each provider's data
    Object.entries(recentData).forEach(([provider, data]) => {
      // Sleep data
      const sleepData = (data as any[]).filter((d: any) => d.data_type === 'sleep').slice(0, 1);
      if (sleepData.length > 0 && sleepData[0].data) {
        const sleep = sleepData[0].data;
        if (sleep.duration_hours) {
          recentMetrics.sleep = `${sleep.duration_hours.toFixed(1)} hours sleep`;
          if (sleep.efficiency) {
            recentMetrics.sleep += ` (${sleep.efficiency}% efficiency)`;
          }
        }
      }

      // Activity data
      const activityData = (data as any[]).filter((d: any) => d.data_type === 'activity').slice(0, 1);
      if (activityData.length > 0 && activityData[0].data) {
        const activity = activityData[0].data;
        const parts = [];
        if (activity.steps) parts.push(`${activity.steps.toLocaleString()} steps`);
        if (activity.calories_burned) parts.push(`${activity.calories_burned} calories`);
        if (activity.distance_meters) parts.push(`${(activity.distance_meters / 1000).toFixed(1)}km`);
        if (parts.length > 0) {
          recentMetrics.activity = parts.join(', ');
        }
      }

      // Heart rate data
      const heartRateData = (data as any[]).filter((d: any) => d.data_type === 'heart_rate').slice(0, 5);
      if (heartRateData.length > 0) {
        const avgHR = heartRateData.reduce((sum, hr) => {
          return sum + (hr.data.bpm || hr.data.avg_bpm || 0);
        }, 0) / heartRateData.length;
        
        if (avgHR > 0) {
          recentMetrics.heart_rate = `${Math.round(avgHR)} bpm average`;
          const latest = heartRateData[0].data;
          if (latest.resting_bpm) {
            recentMetrics.heart_rate += ` (${latest.resting_bpm} bpm resting)`;
          }
        }
      }

      // Body composition data
      const bodyData = (data as any[]).filter((d: any) => d.data_type === 'body').slice(0, 1);
      if (bodyData.length > 0 && bodyData[0].data) {
        const body = bodyData[0].data;
        const parts = [];
        if (body.weight_kg) parts.push(`${body.weight_kg}kg`);
        if (body.body_fat_percentage) parts.push(`${body.body_fat_percentage}% body fat`);
        if (parts.length > 0) {
          recentMetrics.body = parts.join(', ');
        }
      }
    });

    // Get device names for context
    const devices = connections.map(conn => {
      // Use provider display name if available, otherwise format provider name
      if (conn.provider === 'FITBIT') return 'Fitbit';
      if (conn.provider === 'APPLE') return 'Apple Watch/Health';
      if (conn.provider === 'OURA') return 'Oura Ring';
      if (conn.provider === 'GARMIN') return 'Garmin';
      if (conn.provider === 'SAMSUNG') return 'Samsung Health';
      if (conn.provider === 'GOOGLE') return 'Google Fit';
      if (conn.provider === 'WHOOP') return 'WHOOP';
      if (conn.provider === 'POLAR') return 'Polar';
      if (conn.provider === 'WITHINGS') return 'Withings';
      if (conn.provider === 'STRAVA') return 'Strava';
      return conn.provider;
    });

    // Create comprehensive summary for AI
    let summary = `Patient has ${devices.length} connected wearable device${devices.length > 1 ? 's' : ''}: ${devices.join(', ')}.`;
    
    if (healthSummary) {
      summary += ` Recent health metrics: ${healthSummary}`;
    } else {
      summary += " No recent health data available from connected devices.";
    }

    // Add specific metrics context
    const metricsContext = [];
    if (recentMetrics.sleep) metricsContext.push(`Sleep: ${recentMetrics.sleep}`);
    if (recentMetrics.activity) metricsContext.push(`Activity: ${recentMetrics.activity}`);
    if (recentMetrics.heart_rate) metricsContext.push(`Heart Rate: ${recentMetrics.heart_rate}`);
    if (recentMetrics.body) metricsContext.push(`Body Composition: ${recentMetrics.body}`);

    if (metricsContext.length > 0) {
      summary += ` Detailed metrics: ${metricsContext.join('; ')}.`;
    }

    console.log(`📊 Generated wearables context for ${user.email}: ${devices.length} devices, ${Object.keys(recentMetrics).length} metric types`);

    return res.status(200).json({
      success: true,
      wearables_context: {
        has_wearables: true,
        summary,
        recent_metrics: recentMetrics,
        devices
      }
    });

  } catch (error) {
    console.error('Wearables context error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}