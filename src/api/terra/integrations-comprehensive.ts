import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'

interface TerraProvider {
  provider: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  setup_required?: boolean;
  sdk_required?: boolean;
  popular?: boolean;
  medical?: boolean;
}

/**
 * Comprehensive Terra Integrations Endpoint
 * Shows all 49+ providers supported by Terra widget system
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Complete Terra widget-supported providers list (49 total)
    const providers: TerraProvider[] = [
      // Popular Fitness Trackers & Smart Watches
      { provider: 'FITBIT', name: 'Fitbit', description: 'Activity tracking, sleep monitoring, heart rate data', category: 'Fitness Tracker', setup_required: false, popular: true },
      { provider: 'GARMIN', name: 'Garmin', description: 'GPS watches, activity tracking, advanced metrics', category: 'GPS Watch', setup_required: false, popular: true },
      { provider: 'POLAR', name: 'Polar', description: 'Heart rate monitors, fitness watches, training data', category: 'Fitness Watch', setup_required: false, popular: true },
      { provider: 'SUUNTO', name: 'Suunto', description: 'Outdoor sports watches, adventure tracking', category: 'Sports Watch', setup_required: false },
      { provider: 'WAHOO', name: 'Wahoo', description: 'Cycling computers and training sensors', category: 'Cycling Computer', setup_required: false },
      { provider: 'COROS', name: 'COROS', description: 'GPS sports watches with ultra-long battery life', category: 'Sports Watch', setup_required: false },
      
      // Smart Rings & Recovery Devices
      { provider: 'OURA', name: 'Oura Ring', description: 'Sleep optimization, recovery, readiness scores', category: 'Smart Ring', setup_required: false, popular: true },
      { provider: 'WHOOP', name: 'WHOOP', description: 'Recovery tracking, strain monitoring, sleep coaching', category: 'Recovery Wearable', setup_required: false, popular: true },
      
      // Health Platforms & Ecosystems
      { provider: 'APPLE', name: 'Apple Health', description: 'Comprehensive iOS health ecosystem integration', category: 'Health Platform', setup_required: false, sdk_required: true, popular: true },
      { provider: 'GOOGLE', name: 'Google Fit', description: 'Android health platform and activity tracking', category: 'Health Platform', setup_required: false, popular: true },
      { provider: 'SAMSUNG', name: 'Samsung Health', description: 'Galaxy ecosystem health and fitness tracking', category: 'Health Platform', setup_required: false, popular: true },
      
      // Smart Scales & Health Devices
      { provider: 'WITHINGS', name: 'Withings', description: 'Smart scales, blood pressure monitors, sleep tracking', category: 'Health Devices', setup_required: false, popular: true },
      { provider: 'TANITA', name: 'Tanita', description: 'Professional body composition analyzers', category: 'Body Composition', setup_required: false },
      { provider: 'RENPHO', name: 'Renpho', description: 'Smart scales with body composition analysis', category: 'Smart Scale', setup_required: false },
      { provider: 'EUFY', name: 'Eufy', description: 'Smart home scales and health monitoring', category: 'Smart Scale', setup_required: false },
      
      // Fitness Apps & Social Platforms
      { provider: 'STRAVA', name: 'Strava', description: 'Social fitness platform for running and cycling', category: 'Fitness App', setup_required: false, popular: true },
      { provider: 'MYFITNESSPAL', name: 'MyFitnessPal', description: 'Comprehensive nutrition and calorie tracking', category: 'Nutrition App', setup_required: false, popular: true },
      { provider: 'CRONOMETER', name: 'Cronometer', description: 'Detailed nutrition tracking and micronutrient analysis', category: 'Nutrition App', setup_required: false },
      { provider: 'FATSECRET', name: 'FatSecret', description: 'Free calorie counter and diet tracking', category: 'Nutrition App', setup_required: false },
      { provider: 'UNDERARMOUR', name: 'Under Armour', description: 'MyFitnessPal and MapMyRun integration', category: 'Fitness App', setup_required: false },
      { provider: 'NIKE', name: 'Nike Run Club', description: 'Running tracking and guided workouts', category: 'Running App', setup_required: false },
      { provider: 'ADIDAS', name: 'Adidas Running', description: 'GPS running tracker with audio coaching', category: 'Running App', setup_required: false },
      
      // Connected Fitness Equipment
      { provider: 'PELOTON', name: 'Peloton', description: 'Connected bikes, treadmills, and fitness classes', category: 'Connected Fitness', setup_required: false, popular: true },
      { provider: 'CONCEPT2', name: 'Concept2', description: 'Rowing machines and workout tracking', category: 'Rowing Machine', setup_required: false },
      { provider: 'TECHNOGYM', name: 'Technogym', description: 'Professional gym equipment ecosystem', category: 'Gym Equipment', setup_required: false },
      { provider: 'TONAL', name: 'Tonal', description: 'AI-powered strength training system', category: 'Strength Training', setup_required: false },
      { provider: 'MIRROR', name: 'Mirror', description: 'Interactive home gym mirror workouts', category: 'Home Gym', setup_required: false },
      
      // Sleep & Recovery Technology
      { provider: 'EIGHTSLEEP', name: 'Eight Sleep', description: 'Smart mattress with temperature control and sleep tracking', category: 'Sleep Technology', setup_required: false, popular: true },
      { provider: 'SLEEPNUMBER', name: 'Sleep Number', description: 'Smart beds with sleep optimization', category: 'Smart Bed', setup_required: false },
      { provider: 'BEDDIT', name: 'Beddit', description: 'Under-mattress sleep tracking sensor', category: 'Sleep Tracker', setup_required: false },
      
      // Medical Devices & Health Monitors
      { provider: 'FREESTYLE_LIBRE', name: 'FreeStyle Libre', description: 'Continuous glucose monitoring for diabetes management', category: 'CGM', setup_required: true, popular: true, medical: true },
      { provider: 'DEXCOM', name: 'Dexcom', description: 'Advanced continuous glucose monitoring system', category: 'CGM', setup_required: true, popular: true, medical: true },
      { provider: 'OMRON', name: 'Omron', description: 'Blood pressure monitors and health devices', category: 'Blood Pressure', setup_required: false, medical: true },
      { provider: 'IHEALTH', name: 'iHealth', description: 'Connected health monitoring devices', category: 'Health Monitors', setup_required: false, medical: true },
      
      // Virtual Training & Gaming Platforms
      { provider: 'ZWIFT', name: 'Zwift', description: 'Virtual cycling and running in immersive worlds', category: 'Virtual Training', setup_required: false },
      { provider: 'TRAINASONE', name: 'TrainAsONE', description: 'AI-powered personalized training plans', category: 'AI Training', setup_required: false },
      { provider: 'TRAININGPEAKS', name: 'TrainingPeaks', description: 'Advanced training analytics and planning', category: 'Training Platform', setup_required: false },
      { provider: 'TODAYSPLAN', name: "Today's Plan", description: 'Professional coaching and training platform', category: 'Training Platform', setup_required: false },
      
      // Cycling & Outdoor Sports
      { provider: 'HAMMERHEAD', name: 'Hammerhead', description: 'Advanced cycling computers and navigation', category: 'Cycling Computer', setup_required: false },
      { provider: 'LEZYNE', name: 'Lezyne', description: 'GPS cycling computers and tracking', category: 'Cycling Computer', setup_required: false },
      { provider: 'BRYTON', name: 'Bryton', description: 'Affordable GPS cycling computers', category: 'Cycling Computer', setup_required: false },
      
      // Specialized Health & Biometrics
      { provider: 'BIOSTRAP', name: 'Biostrap', description: 'Advanced biometric wearable with PPG sensors', category: 'Biometric Wearable', setup_required: false },
      { provider: 'HRV4TRAINING', name: 'HRV4Training', description: 'Heart rate variability analysis and training', category: 'HRV Analysis', setup_required: false },
      { provider: 'ELITE_HRV', name: 'Elite HRV', description: 'Professional HRV monitoring and analysis', category: 'HRV Analysis', setup_required: false },
      { provider: 'MORPHEUS', name: 'Morpheus', description: 'HRV tracking for recovery optimization', category: 'HRV Tracker', setup_required: false },
      
      // Strength Training & Gym Apps
      { provider: 'FITBOD', name: 'Fitbod', description: 'AI-powered strength training workouts', category: 'Strength Training', setup_required: false },
      { provider: 'STRONGAPP', name: 'Strong', description: 'Simple and effective strength training tracker', category: 'Strength Training', setup_required: false },
      { provider: 'JEFIT', name: 'JEFIT', description: 'Comprehensive gym workout and exercise database', category: 'Strength Training', setup_required: false },
      { provider: 'HEVY', name: 'Hevy', description: 'Modern strength training and workout logging', category: 'Strength Training', setup_required: false }
    ];

    // Filter providers based on query parameters
    const { category, popular_only, medical_only, sdk_only } = req.query;
    let filteredProviders = providers;

    if (category) {
      filteredProviders = filteredProviders.filter(p => 
        p.category.toLowerCase().includes((category as string).toLowerCase())
      );
    }

    if (popular_only === 'true') {
      filteredProviders = filteredProviders.filter(p => p.popular);
    }

    if (medical_only === 'true') {
      filteredProviders = filteredProviders.filter(p => p.medical);
    }

    if (sdk_only === 'true') {
      filteredProviders = filteredProviders.filter(p => p.sdk_required);
    }

    // Group by category
    const categorized = filteredProviders.reduce((acc, provider) => {
      if (!acc[provider.category]) {
        acc[provider.category] = []
      }
      acc[provider.category].push(provider)
      return acc
    }, {} as Record<string, typeof filteredProviders>)

    // Get stats
    const popularProviders = providers.filter(p => p.popular)
    const medicalDevices = providers.filter(p => p.medical)
    const sdkProviders = providers.filter(p => p.sdk_required)
    const categories = Object.keys(categorized)

    return res.status(200).json({
      success: true,
      data: {
        providers: filteredProviders,
        by_category: categorized,
        popular_providers: popularProviders,
        medical_devices: medicalDevices,
        sdk_providers: sdkProviders,
        categories: categories,
        total_count: filteredProviders.length,
        full_provider_count: providers.length,
        widget_session_available: true,
        terra_widget_url: 'https://widget.tryterra.co',
        summary: {
          total: providers.length,
          filtered: filteredProviders.length,
          popular: popularProviders.length,
          medical: medicalDevices.length,
          sdk_required: sdkProviders.length,
          categories: categories.length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching comprehensive Terra integrations:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch Terra integrations' 
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}