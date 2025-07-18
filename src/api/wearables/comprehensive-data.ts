/**
 * Comprehensive Wearables Data API
 * Retrieves detailed Terra API daily health data with all metrics
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { WearablesDatabase } from '../../lib/wearables-database';
import { validateSessionToken } from '../../lib/auth-database';

interface ComprehensiveDataResponse {
  success: boolean;
  health_data?: any[];
  summary?: any;
  message?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ComprehensiveDataResponse>
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

    // Get comprehensive health data from the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const comprehensiveData = await WearablesDatabase.getHealthData(
      user.id,
      'daily_comprehensive',
      thirtyDaysAgo
    );

    // Generate summary statistics
    const summary = generateHealthSummary(comprehensiveData);

    return res.status(200).json({
      success: true,
      health_data: comprehensiveData,
      summary: summary
    });

  } catch (error) {
    console.error('Comprehensive data retrieval error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

function generateHealthSummary(healthData: any[]) {
  if (healthData.length === 0) {
    return null;
  }

  const recentData = healthData.slice(0, 7); // Last 7 days
  
  // Calculate averages
  const avgSteps = calculateAverage(recentData, 'data.activity.steps');
  const avgCalories = calculateAverage(recentData, 'data.calories.total_burned');
  const avgHeartRate = calculateAverage(recentData, 'data.heart_rate.avg_bpm');
  const avgRestingHR = calculateAverage(recentData, 'data.heart_rate.resting_bpm');
  const avgRecoveryScore = calculateAverage(recentData, 'data.scores.recovery');
  const avgActivityScore = calculateAverage(recentData, 'data.scores.activity');
  const avgSleepScore = calculateAverage(recentData, 'data.scores.sleep');
  const avgStress = calculateAverage(recentData, 'data.stress.avg_level');
  const avgVO2Max = calculateAverage(recentData, 'data.oxygen.vo2_max');

  return {
    period: '7 days',
    data_points: recentData.length,
    averages: {
      steps: avgSteps ? Math.round(avgSteps) : null,
      calories_burned: avgCalories ? Math.round(avgCalories) : null,
      heart_rate_avg: avgHeartRate ? Math.round(avgHeartRate) : null,
      heart_rate_resting: avgRestingHR ? Math.round(avgRestingHR) : null,
      recovery_score: avgRecoveryScore ? Math.round(avgRecoveryScore) : null,
      activity_score: avgActivityScore ? Math.round(avgActivityScore) : null,
      sleep_score: avgSleepScore ? Math.round(avgSleepScore) : null,
      stress_level: avgStress ? parseFloat(avgStress.toFixed(1)) : null,
      vo2_max: avgVO2Max ? parseFloat(avgVO2Max.toFixed(1)) : null
    },
    trends: {
      steps_trend: calculateTrend(recentData, 'data.activity.steps'),
      calories_trend: calculateTrend(recentData, 'data.calories.total_burned'),
      recovery_trend: calculateTrend(recentData, 'data.scores.recovery'),
      stress_trend: calculateTrend(recentData, 'data.stress.avg_level')
    }
  };
}

function calculateAverage(data: any[], path: string): number | null {
  const values = data
    .map(item => getNestedValue(item, path))
    .filter(val => val !== null && val !== undefined && !isNaN(val));
  
  if (values.length === 0) return null;
  
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateTrend(data: any[], path: string): 'up' | 'down' | 'stable' | null {
  const values = data
    .map(item => getNestedValue(item, path))
    .filter(val => val !== null && val !== undefined && !isNaN(val));
  
  if (values.length < 3) return null;
  
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  
  const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
  
  const change = (secondAvg - firstAvg) / firstAvg;
  
  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'stable';
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}