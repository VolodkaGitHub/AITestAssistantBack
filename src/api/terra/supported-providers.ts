import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'

/**
 * Terra Supported Providers List
 * Returns comprehensive list of all providers supported by Terra widget
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Terra's comprehensive provider list based on their documentation
    const terraProviders = [
      // Fitness Trackers & Smart Watches
      { provider: 'FITBIT', name: 'Fitbit', category: 'Fitness Tracker', popular: true },
      { provider: 'GARMIN', name: 'Garmin', category: 'GPS Watch', popular: true },
      { provider: 'POLAR', name: 'Polar', category: 'Fitness Watch', popular: true },
      { provider: 'SUUNTO', name: 'Suunto', category: 'Sports Watch', popular: false },
      { provider: 'WAHOO', name: 'Wahoo', category: 'Cycling Computer', popular: false },
      { provider: 'COROS', name: 'COROS', category: 'Sports Watch', popular: false },
      
      // Smart Rings & Recovery Devices
      { provider: 'OURA', name: 'Oura Ring', category: 'Smart Ring', popular: true },
      { provider: 'WHOOP', name: 'WHOOP', category: 'Recovery Wearable', popular: true },
      
      // Health Platforms
      { provider: 'APPLE', name: 'Apple Health', category: 'Health Platform', popular: true, sdk_required: true },
      { provider: 'GOOGLE', name: 'Google Fit', category: 'Health Platform', popular: true },
      { provider: 'SAMSUNG', name: 'Samsung Health', category: 'Health Platform', popular: true },
      
      // Smart Scales & Health Devices
      { provider: 'WITHINGS', name: 'Withings', category: 'Health Devices', popular: true },
      { provider: 'TANITA', name: 'Tanita', category: 'Body Composition', popular: false },
      { provider: 'RENPHO', name: 'Renpho', category: 'Smart Scale', popular: false },
      { provider: 'EUFY', name: 'Eufy', category: 'Smart Scale', popular: false },
      
      // Fitness Apps & Platforms
      { provider: 'STRAVA', name: 'Strava', category: 'Fitness App', popular: true },
      { provider: 'MYFITNESSPAL', name: 'MyFitnessPal', category: 'Nutrition App', popular: true },
      { provider: 'CRONOMETER', name: 'Cronometer', category: 'Nutrition App', popular: false },
      { provider: 'FATSECRET', name: 'FatSecret', category: 'Nutrition App', popular: false },
      { provider: 'UNDERARMOUR', name: 'Under Armour', category: 'Fitness App', popular: false },
      { provider: 'NIKE', name: 'Nike Run Club', category: 'Running App', popular: false },
      { provider: 'ADIDAS', name: 'Adidas Running', category: 'Running App', popular: false },
      
      // Connected Fitness Equipment
      { provider: 'PELOTON', name: 'Peloton', category: 'Connected Fitness', popular: true },
      { provider: 'CONCEPT2', name: 'Concept2', category: 'Rowing Machine', popular: false },
      { provider: 'TECHNOGYM', name: 'Technogym', category: 'Gym Equipment', popular: false },
      { provider: 'TONAL', name: 'Tonal', category: 'Strength Training', popular: false },
      { provider: 'MIRROR', name: 'Mirror', category: 'Home Gym', popular: false },
      
      // Sleep & Recovery
      { provider: 'EIGHTSLEEP', name: 'Eight Sleep', category: 'Sleep Technology', popular: true },
      { provider: 'SLEEPNUMBER', name: 'Sleep Number', category: 'Smart Bed', popular: false },
      { provider: 'BEDDIT', name: 'Beddit', category: 'Sleep Tracker', popular: false },
      
      // Medical Devices
      { provider: 'FREESTYLE_LIBRE', name: 'FreeStyle Libre', category: 'CGM', popular: true, medical: true },
      { provider: 'DEXCOM', name: 'Dexcom', category: 'CGM', popular: true, medical: true },
      { provider: 'OMRON', name: 'Omron', category: 'Blood Pressure', popular: false, medical: true },
      { provider: 'IHEALTH', name: 'iHealth', category: 'Health Monitors', popular: false, medical: true },
      
      // Virtual Training & Gaming
      { provider: 'ZWIFT', name: 'Zwift', category: 'Virtual Training', popular: false },
      { provider: 'TRAINASONE', name: 'TrainAsONE', category: 'AI Training', popular: false },
      { provider: 'TRAININGPEAKS', name: 'TrainingPeaks', category: 'Training Platform', popular: false },
      { provider: 'TODAYSPLAN', name: "Today's Plan", category: 'Training Platform', popular: false },
      
      // Cycling & Outdoor
      { provider: 'HAMMERHEAD', name: 'Hammerhead', category: 'Cycling Computer', popular: false },
      { provider: 'LEZYNE', name: 'Lezyne', category: 'Cycling Computer', popular: false },
      { provider: 'BRYTON', name: 'Bryton', category: 'Cycling Computer', popular: false },
      
      // Specialized Health
      { provider: 'BIOSTRAP', name: 'Biostrap', category: 'Biometric Wearable', popular: false },
      { provider: 'HRV4TRAINING', name: 'HRV4Training', category: 'HRV Analysis', popular: false },
      { provider: 'ELITE_HRV', name: 'Elite HRV', category: 'HRV Analysis', popular: false },
      { provider: 'MORPHEUS', name: 'Morpheus', category: 'HRV Tracker', popular: false },
      
      // Additional Platforms
      { provider: 'FITBOD', name: 'Fitbod', category: 'Strength Training', popular: false },
      { provider: 'STRONGAPP', name: 'Strong', category: 'Strength Training', popular: false },
      { provider: 'JEFIT', name: 'JEFIT', category: 'Strength Training', popular: false },
      { provider: 'HEVY', name: 'Hevy', category: 'Strength Training', popular: false }
    ]

    // Group by category
    const categorized = terraProviders.reduce((acc, provider) => {
      if (!acc[provider.category]) {
        acc[provider.category] = []
      }
      acc[provider.category].push(provider)
      return acc
    }, {} as Record<string, typeof terraProviders>)

    // Get popular providers
    const popularProviders = terraProviders.filter(p => p.popular)
    const medicalDevices = terraProviders.filter(p => p.medical)
    const sdkProviders = terraProviders.filter(p => p.sdk_required)

    return res.status(200).json({
      success: true,
      data: {
        all_providers: terraProviders,
        by_category: categorized,
        popular_providers: popularProviders,
        medical_devices: medicalDevices,
        sdk_providers: sdkProviders,
        total_count: terraProviders.length,
        categories: Object.keys(categorized),
        summary: {
          total: terraProviders.length,
          popular: popularProviders.length,
          medical: medicalDevices.length,
          sdk_required: sdkProviders.length,
          categories: Object.keys(categorized).length
        }
      }
    })

  } catch (error) {
    console.error('Error fetching Terra supported providers:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch supported providers',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}