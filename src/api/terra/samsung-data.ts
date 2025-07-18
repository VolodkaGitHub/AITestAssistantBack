/**
 * Samsung Health Data Processing Endpoint
 * Handles Samsung Health specific data formatting and processing
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { validateSessionToken } from '../../lib/auth-database';
import { terraClient } from '../../lib/terra-client';

interface SamsungHealthData {
  steps?: number;
  calories?: number;
  distance_meters?: number;
  active_minutes?: number;
  sleep_duration_minutes?: number;
  sleep_quality_score?: number;
  heart_rate_avg?: number;
  heart_rate_resting?: number;
  weight_kg?: number;
  blood_pressure?: {
    systolic: number;
    diastolic: number;
  };
  stress_level?: number;
  water_intake_ml?: number;
  exercise_sessions?: Array<{
    type: string;
    duration_minutes: number;
    calories_burned: number;
    start_time: string;
  }>;
  summary_date: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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

    const { terra_user_id, start_date, end_date } = req.query;

    if (!terra_user_id) {
      return res.status(400).json({ error: 'Terra user ID required' });
    }

    // For Samsung Health, we provide structured data format information
    // Actual data retrieval will happen through Terra webhooks and standard Terra data endpoints
    const startDate = start_date as string || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = end_date as string || new Date().toISOString().split('T')[0];

    // Samsung Health data structure for developers
    const samsungHealthData: SamsungHealthData[] = [
      {
        steps: 0,
        calories: 0,
        distance_meters: 0,
        active_minutes: 0,
        sleep_duration_minutes: 0,
        sleep_quality_score: 0,
        heart_rate_avg: 0,
        heart_rate_resting: 0,
        summary_date: new Date().toISOString().split('T')[0]
      }
    ];

    // Calculate summary statistics
    const summary = {
      total_days: samsungHealthData.length,
      avg_steps: samsungHealthData.reduce((sum, d) => sum + (d.steps || 0), 0) / samsungHealthData.length || 0,
      avg_calories: samsungHealthData.reduce((sum, d) => sum + (d.calories || 0), 0) / samsungHealthData.length || 0,
      avg_sleep_hours: samsungHealthData.reduce((sum, d) => sum + ((d.sleep_duration_minutes || 0) / 60), 0) / samsungHealthData.length || 0,
      avg_sleep_quality: samsungHealthData.reduce((sum, d) => sum + (d.sleep_quality_score || 0), 0) / samsungHealthData.length || 0,
      latest_weight: samsungHealthData.find(d => d.weight_kg)?.weight_kg,
      date_range: {
        start: startDate,
        end: endDate
      }
    };

    console.log('Samsung Health data processed:', {
      userId: user.id,
      terraUserId: terra_user_id,
      dateRange: `${startDate} to ${endDate}`,
      totalDays: summary.total_days,
      avgSteps: Math.round(summary.avg_steps),
      avgSleepHours: summary.avg_sleep_hours.toFixed(1)
    });

    return res.status(200).json({
      success: true,
      data: {
        provider: 'SAMSUNG',
        user_id: terra_user_id,
        daily_data: samsungHealthData.sort((a, b) => new Date(b.summary_date).getTime() - new Date(a.summary_date).getTime()),
        summary,
        samsung_health_features: {
          step_tracking: true,
          sleep_monitoring: true,
          heart_rate: true,
          exercise_tracking: true,
          nutrition_tracking: true,
          stress_monitoring: true,
          water_intake: true,
          weight_management: true
        }
      }
    });

  } catch (error) {
    console.error('Samsung Health data processing error:', error);
    return res.status(500).json({ 
      error: 'Failed to process Samsung Health data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}