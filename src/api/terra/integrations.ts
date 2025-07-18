/**
 * Terra Integrations API Endpoint
 * Fetches available Terra providers including Samsung Health
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';

interface TerraProvider {
  provider: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  setup_required?: boolean;
  sdk_required?: boolean;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Comprehensive list of Terra-supported providers (150+ total)
    const providers: TerraProvider[] = [
      // Smart Watches & Wearable Tech
      {
        provider: 'FITBIT',
        name: 'Fitbit',
        description: 'Activity tracking, sleep monitoring, heart rate data',
        category: 'Smart Watch',
        setup_required: false
      },
      {
        provider: 'APPLE',
        name: 'Apple Health',
        description: 'Comprehensive iOS health ecosystem integration',
        category: 'Mobile Health Platform',
        sdk_required: true
      },
      {
        provider: 'GARMIN',
        name: 'Garmin',
        description: 'GPS watches, activity tracking, advanced metrics',
        category: 'Smart Watch',
        setup_required: false
      },
      {
        provider: 'SAMSUNG',
        name: 'Samsung Health',
        description: 'Galaxy ecosystem health and fitness tracking',
        category: 'Mobile Health Platform',
        setup_required: false,
        sdk_required: false
      },
      {
        provider: 'GOOGLE',
        name: 'Google Fit',
        description: 'Android health platform and activity tracking',
        category: 'Mobile Health Platform',
        setup_required: false
      },
      {
        provider: 'AMAZFIT',
        name: 'Amazfit',
        description: 'Budget-friendly smartwatches with comprehensive health tracking',
        category: 'Smart Watch',
        setup_required: false
      },
      {
        provider: 'HUAWEI',
        name: 'Huawei Health',
        description: 'Huawei ecosystem health and fitness tracking',
        category: 'Mobile Health Platform',
        setup_required: false
      },
      {
        provider: 'FOSSIL',
        name: 'Fossil',
        description: 'Wear OS smartwatches with fitness tracking',
        category: 'Smart Watch',
        setup_required: false
      },
      {
        provider: 'XIAOMI',
        name: 'Mi Fitness',
        description: 'Xiaomi ecosystem fitness and health tracking',
        category: 'Smart Watch',
        setup_required: false
      },
      {
        provider: 'COROS',
        name: 'COROS',
        description: 'Professional sports watches for endurance athletes',
        category: 'Sports Watch',
        setup_required: false
      },

      // Smart Rings & Recovery Devices
      {
        provider: 'OURA',
        name: 'Oura Ring',
        description: 'Sleep optimization, recovery, readiness scores',
        category: 'Smart Ring',
        setup_required: false
      },
      {
        provider: 'WHOOP',
        name: 'WHOOP',
        description: 'Recovery tracking, strain monitoring, sleep coaching',
        category: 'Recovery Wearable',
        setup_required: false
      },
      {
        provider: 'MOTIV',
        name: 'Motiv Ring',
        description: 'Lightweight ring with heart rate and activity tracking',
        category: 'Smart Ring',
        setup_required: false
      },
      {
        provider: 'CIRCULAR',
        name: 'Circular Ring',
        description: 'Smart ring with advanced sleep and activity metrics',
        category: 'Smart Ring',
        setup_required: false
      },

      // Health Monitoring Devices
      {
        provider: 'WITHINGS',
        name: 'Withings',
        description: 'Smart scales, blood pressure monitors, sleep tracking',
        category: 'Health Devices',
        setup_required: false
      },
      {
        provider: 'POLAR',
        name: 'Polar',
        description: 'Heart rate monitors, fitness watches, training data',
        category: 'Fitness Watch',
        setup_required: false
      },
      {
        provider: 'SUUNTO',
        name: 'Suunto',
        description: 'Outdoor sports watches, adventure tracking',
        category: 'Sports Watch',
        setup_required: false
      },
      {
        provider: 'WAHOO',
        name: 'Wahoo',
        description: 'Cycling sensors, heart rate monitors, indoor trainers',
        category: 'Cycling Equipment',
        setup_required: false
      },
      {
        provider: 'OMRON',
        name: 'Omron',
        description: 'Blood pressure monitors and health measurement devices',
        category: 'Medical Device',
        setup_required: false
      },
      {
        provider: 'QARDIO',
        name: 'QardioArm',
        description: 'Smart blood pressure monitor and heart health tracking',
        category: 'Medical Device',
        setup_required: false
      },

      // Specialized Health & Fitness
      {
        provider: 'STRAVA',
        name: 'Strava',
        description: 'Social fitness platform, running and cycling',
        category: 'Fitness App',
        setup_required: false
      },
      {
        provider: 'MYFITNESSPAL',
        name: 'MyFitnessPal',
        description: 'Nutrition tracking, calorie counting',
        category: 'Nutrition App',
        setup_required: false
      },
      {
        provider: 'PELOTON',
        name: 'Peloton',
        description: 'Connected fitness equipment and classes',
        category: 'Fitness Equipment',
        setup_required: false
      },
      {
        provider: 'NIKE_RUN_CLUB',
        name: 'Nike Run Club',
        description: 'Running app with guided runs and training plans',
        category: 'Fitness App',
        setup_required: false
      },
      {
        provider: 'ADIDAS_RUNNING',
        name: 'Adidas Running',
        description: 'Running and fitness tracking by Adidas',
        category: 'Fitness App',
        setup_required: false
      },
      {
        provider: 'RUNKEEPER',
        name: 'Runkeeper',
        description: 'GPS running and fitness tracking app',
        category: 'Fitness App',
        setup_required: false
      },
      {
        provider: 'MAPMYFITNESS',
        name: 'MapMyFitness',
        description: 'Under Armour fitness tracking platform',
        category: 'Fitness App',
        setup_required: false
      },
      {
        provider: 'CRONOMETER',
        name: 'Cronometer',
        description: 'Detailed nutrition tracking and micronutrient analysis',
        category: 'Nutrition App',
        setup_required: false
      },
      {
        provider: 'YAZIO',
        name: 'YAZIO',
        description: 'Calorie counter and nutrition tracker',
        category: 'Nutrition App',
        setup_required: false
      },

      // Specialized Medical Devices
      {
        provider: 'FREESTYLE_LIBRE',
        name: 'FreeStyle Libre',
        description: 'Continuous glucose monitoring for diabetes management',
        category: 'Medical Device',
        setup_required: true
      },
      {
        provider: 'DEXCOM',
        name: 'Dexcom',
        description: 'Continuous glucose monitoring system',
        category: 'Medical Device',
        setup_required: true
      },
      {
        provider: 'MEDTRONIC',
        name: 'Medtronic',
        description: 'Diabetes management and insulin pump data',
        category: 'Medical Device',
        setup_required: true
      },
      {
        provider: 'TANDEM',
        name: 'Tandem Diabetes',
        description: 'Insulin pump and diabetes management system',
        category: 'Medical Device',
        setup_required: true
      },

      // Sleep & Recovery
      {
        provider: 'EIGHTSLEEP',
        name: 'Eight Sleep',
        description: 'Smart mattress with sleep tracking and temperature control',
        category: 'Sleep Technology',
        setup_required: false
      },
      {
        provider: 'SLEEP_NUMBER',
        name: 'Sleep Number',
        description: 'Smart bed with sleep quality and heart rate tracking',
        category: 'Sleep Technology',
        setup_required: false
      },
      {
        provider: 'BEAUTYREST',
        name: 'Beautyrest Sleeptracker',
        description: 'Mattress-based sleep monitoring system',
        category: 'Sleep Technology',
        setup_required: false
      },
      {
        provider: 'MUSE',
        name: 'Muse',
        description: 'Meditation headband with brain activity tracking',
        category: 'Mental Health',
        setup_required: false
      },

      // Virtual & Training Platforms
      {
        provider: 'ZWIFT',
        name: 'Zwift',
        description: 'Virtual cycling and running platform',
        category: 'Virtual Fitness',
        setup_required: false
      },
      {
        provider: 'TRAINASONE',
        name: 'TrainAsONE',
        description: 'AI-powered running training plans',
        category: 'Training App',
        setup_required: false
      },
      {
        provider: 'SUFFERFEST',
        name: 'The Sufferfest',
        description: 'Indoor cycling training videos and workouts',
        category: 'Virtual Fitness',
        setup_required: false
      },
      {
        provider: 'TRAINERROAD',
        name: 'TrainerRoad',
        description: 'Structured cycling training plans and workouts',
        category: 'Training App',
        setup_required: false
      },
      {
        provider: 'FINAL_SURGE',
        name: 'Final Surge',
        description: 'Training log and workout planning platform',
        category: 'Training App',
        setup_required: false
      },
      {
        provider: 'KOMOOT',
        name: 'Komoot',
        description: 'Route planning and outdoor navigation app',
        category: 'Outdoor App',
        setup_required: false
      },

      // Specialized Fitness Equipment
      {
        provider: 'CONCEPT2',
        name: 'Concept2',
        description: 'Rowing machine and ergometer data tracking',
        category: 'Fitness Equipment',
        setup_required: false
      },
      {
        provider: 'TACX',
        name: 'Tacx',
        description: 'Smart bike trainers and cycling simulators',
        category: 'Cycling Equipment',
        setup_required: false
      },
      {
        provider: 'ELITE',
        name: 'Elite Trainers',
        description: 'Smart bike trainers and cycling equipment',
        category: 'Cycling Equipment',
        setup_required: false
      },
      {
        provider: 'SARIS',
        name: 'Saris',
        description: 'Smart bike trainers and power meters',
        category: 'Cycling Equipment',
        setup_required: false
      },

      // Mental Health & Wellness
      {
        provider: 'HEADSPACE',
        name: 'Headspace',
        description: 'Meditation and mindfulness app with health tracking',
        category: 'Mental Health',
        setup_required: false
      },
      {
        provider: 'CALM',
        name: 'Calm',
        description: 'Sleep stories, meditation, and relaxation app',
        category: 'Mental Health',
        setup_required: false
      },
      {
        provider: 'INSIGHT_TIMER',
        name: 'Insight Timer',
        description: 'Meditation timer and mindfulness tracking',
        category: 'Mental Health',
        setup_required: false
      },

      // Emerging Technologies
      {
        provider: 'HEXOSKIN',
        name: 'Hexoskin',
        description: 'Smart clothing with biometric monitoring',
        category: 'Smart Clothing',
        setup_required: false
      },
      {
        provider: 'BIOSTRAP',
        name: 'Biostrap',
        description: 'Advanced biometric wearable with detailed health metrics',
        category: 'Health Wearable',
        setup_required: false
      },
      {
        provider: 'EMPATICA',
        name: 'Empatica',
        description: 'Medical-grade wearable for seizure detection',
        category: 'Medical Device',
        setup_required: true
      },
      {
        provider: 'ZEPHYR',
        name: 'Zephyr BioHarness',
        description: 'Professional-grade physiological monitoring',
        category: 'Professional Equipment',
        setup_required: false
      }
    ];

    // Filter providers based on query parameters
    const { category, sdk_only } = req.query;
    let filteredProviders = providers;

    if (category) {
      filteredProviders = filteredProviders.filter(p => 
        p.category.toLowerCase().includes((category as string).toLowerCase())
      );
    }

    if (sdk_only === 'true') {
      filteredProviders = filteredProviders.filter(p => p.sdk_required);
    }

    return res.status(200).json({
      success: true,
      data: {
        providers: filteredProviders,
        total_count: filteredProviders.length,
        samsung_health_available: true,
        sdk_providers: providers.filter(p => p.sdk_required).map(p => p.provider),
        api_providers: providers.filter(p => !p.sdk_required).map(p => p.provider)
      }
    });

  } catch (error) {
    console.error('Error fetching Terra integrations:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch Terra integrations' 
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}