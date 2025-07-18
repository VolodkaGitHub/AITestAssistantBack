// Comprehensive Terra API Service for Oura Ring and Google Fit Integration
import { WearablesDatabase } from '../../lib/wearables-database'

export interface TerraUser {
  user_id: string
  provider: string
  last_webhook_update: string | null
  scopes: string[]
}

export interface TerraDataPoint {
  timestamp: string
  value: number
  type?: string
}

export interface TerraActivityData {
  user_id: string
  data: {
    metadata: {
      start_time: string
      end_time: string
    }
    distance_data: {
      summary: {
        distance_meters: number
      }
      detailed: {
        distance_samples: TerraDataPoint[]
      }
    }
    calories_data: {
      net_active_calories: number
      BMR_calories: number
      total_burned_calories: number
    }
    steps_data: {
      summary: {
        count: number
      }
      detailed: {
        steps_samples: TerraDataPoint[]
      }
    }
    active_durations_data: {
      activity_seconds: number
      rest_seconds: number
    }
  }[]
}

export interface TerraSleepData {
  user_id: string
  data: {
    metadata: {
      start_time: string
      end_time: string
    }
    sleep_durations_data: {
      asleep: {
        duration_asleep_state_seconds: number
      }
      awake: {
        duration_awake_state_seconds: number
      }
      light: {
        duration_light_sleep_state_seconds: number
      }
      deep: {
        duration_deep_sleep_state_seconds: number
      }
      REM: {
        duration_REM_sleep_state_seconds: number
      }
    }
    sleep_efficiency: number
    time_in_bed_seconds: number
  }[]
}

export interface TerraHeartRateData {
  user_id: string
  data: {
    metadata: {
      start_time: string
      end_time: string
    }
    heart_rate_data: {
      summary: {
        resting_hr_bpm: number
        max_hr_bpm: number
        avg_hr_bpm: number
      }
      detailed: {
        hr_samples: TerraDataPoint[]
      }
    }
  }[]
}

export interface TerraBodyData {
  user_id: string
  data: {
    metadata: {
      start_time: string
      end_time: string
    }
    body_data: {
      weight_kg?: number
      body_fat_percentage?: number
      muscle_mass_kg?: number
      bone_mass_kg?: number
      body_water_percentage?: number
    }
    measurements_data: {
      chest_circumference_cm?: number
      waist_circumference_cm?: number
      hip_circumference_cm?: number
    }
  }[]
}

export class TerraAPIService {
  private static readonly BASE_URL = 'https://api.tryterra.co'
  private static readonly API_KEY = process.env.TERRA_API_KEY
  private static readonly DEV_ID = process.env.TERRA_DEV_ID
  private static readonly SIGNING_SECRET = process.env.TERRA_SIGNING_SECRET

  // Get authentication URL for device connection
  static async generateAuthURL(provider: string, redirectURI: string, userId: string): Promise<string> {
    return this.getAuthURL(provider as 'OURA' | 'GOOGLE', redirectURI, userId);
  }

  static async getAuthURL(provider: 'OURA' | 'GOOGLE', redirectURI: string, userId: string): Promise<string> {
    try {
      const response = await fetch(`${this.BASE_URL}/v2/auth/generateAuthURL`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'dev-id': this.DEV_ID!,
          'x-api-key': this.API_KEY!
        },
        body: JSON.stringify({
          resource: provider,
          auth_success_redirect_url: redirectURI,
          auth_failure_redirect_url: redirectURI,
          reference_id: userId
        })
      })

      if (!response.ok) {
        throw new Error(`Terra auth URL generation failed: ${response.status}`)
      }

      const data = await response.json()
      console.log(`✅ Terra auth URL generated for ${provider}:`, data.auth_url)
      return data.auth_url
    } catch (error) {
      console.error(`❌ Error generating Terra auth URL for ${provider}:`, error)
      throw error
    }
  }

  // Fetch daily activity data from Terra
  static async getDailyActivity(terraUserId: string, date: string): Promise<TerraActivityData | null> {
    try {
      const response = await fetch(`${this.BASE_URL}/v2/daily/${terraUserId}?start_date=${date}&end_date=${date}&to_webhook=false&with_samples=true`, {
        method: 'GET',
        headers: {
          'dev-id': this.DEV_ID!,
          'x-api-key': this.API_KEY!
        }
      })

      if (!response.ok) {
        console.warn(`Terra daily activity fetch failed: ${response.status}`)
        return null
      }

      const data = await response.json()
      console.log(`✅ Terra daily activity fetched for ${terraUserId} on ${date}`)
      return data
    } catch (error) {
      console.error('❌ Error fetching Terra daily activity:', error)
      return null
    }
  }

  // Fetch sleep data from Terra
  static async getDailySleep(terraUserId: string, date: string): Promise<TerraSleepData | null> {
    try {
      const response = await fetch(`${this.BASE_URL}/v2/sleep/${terraUserId}?start_date=${date}&end_date=${date}&to_webhook=false&with_samples=true`, {
        method: 'GET',
        headers: {
          'dev-id': this.DEV_ID!,
          'x-api-key': this.API_KEY!
        }
      })

      if (!response.ok) {
        console.warn(`Terra sleep data fetch failed: ${response.status}`)
        return null
      }

      const data = await response.json()
      console.log(`✅ Terra sleep data fetched for ${terraUserId} on ${date}`)
      return data
    } catch (error) {
      console.error('❌ Error fetching Terra sleep data:', error)
      return null
    }
  }

  // Fetch heart rate data from Terra
  static async getDailyHeartRate(terraUserId: string, date: string): Promise<TerraHeartRateData | null> {
    try {
      const response = await fetch(`${this.BASE_URL}/v2/heart/${terraUserId}?start_date=${date}&end_date=${date}&to_webhook=false&with_samples=true`, {
        method: 'GET',
        headers: {
          'dev-id': this.DEV_ID!,
          'x-api-key': this.API_KEY!
        }
      })

      if (!response.ok) {
        console.warn(`Terra heart rate data fetch failed: ${response.status}`)
        return null
      }

      const data = await response.json()
      console.log(`✅ Terra heart rate data fetched for ${terraUserId} on ${date}`)
      return data
    } catch (error) {
      console.error('❌ Error fetching Terra heart rate data:', error)
      return null
    }
  }

  // Fetch body composition data from Terra
  static async getDailyBody(terraUserId: string, date: string): Promise<TerraBodyData | null> {
    try {
      const response = await fetch(`${this.BASE_URL}/v2/body/${terraUserId}?start_date=${date}&end_date=${date}&to_webhook=false&with_samples=true`, {
        method: 'GET',
        headers: {
          'dev-id': this.DEV_ID!,
          'x-api-key': this.API_KEY!
        }
      })

      if (!response.ok) {
        console.warn(`Terra body data fetch failed: ${response.status}`)
        return null
      }

      const data = await response.json()
      console.log(`✅ Terra body data fetched for ${terraUserId} on ${date}`)
      return data
    } catch (error) {
      console.error('❌ Error fetching Terra body data:', error)
      return null
    }
  }

  // Comprehensive daily data sync for a user
  static async syncDailyDataForUser(userId: string, date: string): Promise<boolean> {
    try {
      console.log(`🔄 Starting daily data sync for user ${userId} on ${date}`)
      
      // Get user's wearable connections
      const connections = await WearablesDatabase.getUserConnections(userId)
      
      if (connections.length === 0) {
        console.log('ℹ️ No wearable connections found for user')
        return false
      }

      let syncSuccess = false

      for (const connection of connections) {
        if (!connection.is_active) continue

        try {
          console.log(`🔄 Syncing data for ${connection.provider} (${connection.terra_user_id})`)

          // Fetch all data types
          const [activityData, sleepData, heartRateData, bodyData] = await Promise.all([
            this.getDailyActivity(connection.terra_user_id, date),
            this.getDailySleep(connection.terra_user_id, date),
            this.getDailyHeartRate(connection.terra_user_id, date),
            this.getDailyBody(connection.terra_user_id, date)
          ])

          // Save raw data to wearable_health_data table
          if (activityData && activityData.data && activityData.data.length > 0) {
            await WearablesDatabase.saveHealthData(
              userId, 
              connection.provider, 
              'activity', 
              activityData.data[0], 
              new Date(date)
            )
          }

          if (sleepData && sleepData.data && sleepData.data.length > 0) {
            await WearablesDatabase.saveHealthData(
              userId, 
              connection.provider, 
              'sleep', 
              sleepData.data[0], 
              new Date(date)
            )
          }

          if (heartRateData && heartRateData.data && heartRateData.data.length > 0) {
            await WearablesDatabase.saveHealthData(
              userId, 
              connection.provider, 
              'heart_rate', 
              heartRateData.data[0], 
              new Date(date)
            )
          }

          if (bodyData && bodyData.data && bodyData.data.length > 0) {
            await WearablesDatabase.saveHealthData(
              userId, 
              connection.provider, 
              'body', 
              bodyData.data[0], 
              new Date(date)
            )
          }

          // Create daily summary from fetched data
          const summaryData = this.createDailySummary(activityData, sleepData, heartRateData, bodyData)
          
          // Save daily health summary
          await WearablesDatabase.saveDailyHealthSummary(
            userId,
            date,
            connection.provider,
            summaryData,
            connection.terra_user_id
          )

          // Update last sync time
          await WearablesDatabase.updateLastSync(userId, connection.provider)
          
          console.log(`✅ Successfully synced data for ${connection.provider}`)
          syncSuccess = true

        } catch (error) {
          console.error(`❌ Error syncing data for ${connection.provider}:`, error)
          continue
        }
      }

      return syncSuccess
    } catch (error) {
      console.error('❌ Error in daily data sync:', error)
      return false
    }
  }

  // Create daily summary from raw Terra data
  private static createDailySummary(
    activityData: TerraActivityData | null,
    sleepData: TerraSleepData | null,
    heartRateData: TerraHeartRateData | null,
    bodyData: TerraBodyData | null
  ): any {
    const summary: any = {}

    // Extract activity metrics
    if (activityData && activityData.data && activityData.data.length > 0) {
      const activity = activityData.data[0]
      summary.steps = activity.steps_data?.summary?.count || 0
      summary.calories_burned = activity.calories_data?.total_burned_calories || 0
      summary.distance = activity.distance_data?.summary?.distance_meters ? 
        Math.round(activity.distance_data.summary.distance_meters / 1000 * 100) / 100 : 0 // Convert to km
      summary.active_minutes = activity.active_durations_data?.activity_seconds ? 
        Math.round(activity.active_durations_data.activity_seconds / 60) : 0
    }

    // Extract sleep metrics
    if (sleepData && sleepData.data && sleepData.data.length > 0) {
      const sleep = sleepData.data[0]
      summary.sleep_duration = sleep.sleep_durations_data?.asleep?.duration_asleep_state_seconds ?
        Math.round(sleep.sleep_durations_data.asleep.duration_asleep_state_seconds / 60) : 0 // Convert to minutes
      summary.sleep_efficiency = sleep.sleep_efficiency ? Math.round(sleep.sleep_efficiency * 100) : 0
    }

    // Extract heart rate metrics
    if (heartRateData && heartRateData.data && heartRateData.data.length > 0) {
      const heartRate = heartRateData.data[0]
      summary.resting_heart_rate = heartRate.heart_rate_data?.summary?.resting_hr_bpm || 0
    }

    return summary
  }

  // Get user data for @mention context
  static async getUserDataForMention(userId: string): Promise<any> {
    try {
      // Get latest health metrics from database
      const metrics = await WearablesDatabase.getLatestHealthMetrics(userId)
      
      if (metrics.providers.length === 0) {
        return {
          status: 'no_data',
          message: 'No recent wearable data available'
        }
      }

      // Format for @mention display
      const formattedData = {
        status: 'success',
        providers: metrics.summary.active_providers,
        summary: {
          steps: metrics.summary.total_steps.toLocaleString(),
          calories: Math.round(metrics.summary.total_calories).toLocaleString(),
          sleep: metrics.summary.avg_sleep_duration > 0 ? 
            `${Math.round(metrics.summary.avg_sleep_duration / 60 * 10) / 10} hours` : 'No data',
          heart_rate: metrics.summary.avg_heart_rate > 0 ? 
            `${Math.round(metrics.summary.avg_heart_rate)} bpm` : 'No data'
        },
        last_updated: new Date().toISOString()
      }

      return formattedData
    } catch (error) {
      console.error('❌ Error getting user data for mention:', error)
      return {
        status: 'error',
        message: 'Failed to retrieve wearable data'
      }
    }
  }

  // Instance methods for backward compatibility with terraClient
  async getActivity(terraUserId: string, startDate: string, endDate: string): Promise<any[]> {
    try {
      const data = await TerraAPIService.getDailyActivity(terraUserId, startDate);
      return data ? [data] : [];
    } catch (error) {
      console.error('Error in getActivity:', error);
      return [];
    }
  }

  async getSleep(terraUserId: string, startDate: string, endDate: string): Promise<any[]> {
    try {
      const data = await TerraAPIService.getDailySleep(terraUserId, startDate);
      return data ? [data] : [];
    } catch (error) {
      console.error('Error in getSleep:', error);
      return [];
    }
  }

  async getBody(terraUserId: string, startDate: string, endDate: string): Promise<any[]> {
    try {
      const data = await TerraAPIService.getDailyBody(terraUserId, startDate);
      return data ? [data] : [];
    } catch (error) {
      console.error('Error in getBody:', error);
      return [];
    }
  }

  async getUser(terraUserId: string): Promise<TerraUser | null> {
    try {
      // Terra API doesn't have a direct user info endpoint, so we'll return basic info
      return {
        user_id: terraUserId,
        provider: 'unknown',
        last_webhook_update: null,
        scopes: []
      };
    } catch (error) {
      console.error('Error in getUser:', error);
      return null;
    }
  }

  async requestData(terraUserId: string): Promise<boolean> {
    try {
      // Request fresh data sync from Terra for this user
      const response = await fetch(`${TerraAPIService.BASE_URL}/v2/daily/${terraUserId}?to_webhook=true`, {
        method: 'GET',
        headers: {
          'dev-id': TerraAPIService.DEV_ID!,
          'x-api-key': TerraAPIService.API_KEY!
        }
      });

      console.log(`Terra data request initiated for user ${terraUserId}: ${response.status}`);
      return response.ok;
    } catch (error) {
      console.error('Error in requestData:', error);
      return false;
    }
  }

  async generateAuthURL(provider: string, redirectUri: string, referenceId: string): Promise<{ auth_url: string; user_id: string }> {
    try {
      const auth_url = await TerraAPIService.generateAuthURL(provider, redirectUri, referenceId);
      return {
        auth_url,
        user_id: referenceId // Use reference ID as temporary user ID
      };
    } catch (error) {
      console.error('Error in generateAuthURL:', error);
      throw error;
    }
  }

  async getHeartRateData(terraUserId: string, startDate: string, endDate: string): Promise<any[]> {
    try {
      const data = await TerraAPIService.getDailyActivity(terraUserId, startDate);
      return data ? [data] : [];
    } catch (error) {
      console.error('Error in getHeartRateData:', error);
      return [];
    }
  }

  async getActivityData(terraUserId: string, startDate?: string, endDate?: string): Promise<any[]> {
    try {
      // Provide default dates if not specified
      if (!startDate) {
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
      const data = await TerraAPIService.getDailyActivity(terraUserId, startDate);
      return data ? [data] : [];
    } catch (error) {
      console.error('Error in getActivityData:', error);
      return [];
    }
  }

  async getBodyData(terraUserId: string, startDate: string, endDate: string): Promise<any[]> {
    try {
      const data = await TerraAPIService.getDailyBody(terraUserId, startDate);
      return data ? [data] : [];
    } catch (error) {
      console.error('Error in getBodyData:', error);
      return [];
    }
  }

  async disconnectUser(terraUserId: string): Promise<boolean> {
    try {
      // Implementation would depend on Terra API's disconnect endpoint
      console.log(`Disconnecting user ${terraUserId}`);
      return true;
    } catch (error) {
      console.error('Error in disconnectUser:', error);
      return false;
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const crypto = require('crypto');
      const secret = process.env.TERRA_SECRET;
      if (!secret) return false;

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }
}