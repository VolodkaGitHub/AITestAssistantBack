import { MentionOption } from '@/components/EnhancedMentionDropdown'
import LinkedMentionService from './linked-mention-service'
import { contextPreloader } from './context-preloader'

interface MentionData {
  type: string
  summary: string
  data: any
  timestamp: string
  sourceUser?: string
  sourceUserName?: string
  isLinkedAccount?: boolean
}

class MentionDataService {
  private sessionToken: string
  private linkedMentionService: LinkedMentionService
  private userId?: string

  constructor(sessionToken: string, userId?: string) {
    this.sessionToken = sessionToken
    this.linkedMentionService = new LinkedMentionService(sessionToken)
    this.userId = userId
  }

  async fetchMentionData(mentionType: string, linkedAccountId?: string): Promise<MentionData | null> {
    try {
      // Handle linked account data requests
      if (linkedAccountId) {
        console.log(`🔗 Fetching linked account data: ${mentionType} from account ${linkedAccountId}`)
        const linkedData = await this.linkedMentionService.fetchLinkedUserData(linkedAccountId, mentionType)
        
        if (linkedData) {
          return {
            type: linkedData.type,
            summary: linkedData.summary,
            data: linkedData.data,
            timestamp: linkedData.timestamp,
            sourceUser: linkedData.sourceUser,
            sourceUserName: linkedData.sourceUserName,
            isLinkedAccount: true
          }
        }
        return null
      }

      // Check for preloaded context first (for performance)
      if (this.userId) {
        const preloadedData = contextPreloader.getPreloadedMentionData(this.userId, mentionType)
        if (preloadedData) {
          console.log(`⚡ Using preloaded ${mentionType} data for better performance`)
          return preloadedData
        }
      }

      // Handle regular (own) data requests
      switch (mentionType) {
        case 'wearables':
          return await this.fetchWearablesData()
        case 'medications':
          return await this.fetchMedicationsData()
        case 'lab_results':
          return await this.fetchLabResultsData()
        case 'health_timeline':
          return await this.fetchHealthTimelineData()
        case 'vitals':
          return await this.fetchVitalsData()
        case 'conditions':
          return await this.fetchConditionsData()
        default:
          return null
      }
    } catch (error) {
      console.error(`Error fetching ${mentionType} data:`, error)
      return null
    }
  }

  private async fetchWearablesData(): Promise<MentionData> {
    const response = await fetch('/api/mention/wearables', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch wearables data')
    }

    const data = await response.json()
    
    return {
      type: data.type || 'wearables',
      summary: data.summary || 'No wearable data available',
      data: data.detailed_data || data.data,
      timestamp: data.timestamp || new Date().toISOString()
    }
  }

  private formatWearablesSummary(dailyScores: any[]): string {
    if (!dailyScores || dailyScores.length === 0) {
      return 'No recent wearable data available'
    }

    const daysWithData = dailyScores.filter(day => 
      day.sleep_score || day.stress_score || day.respiratory_score
    ).length

    if (daysWithData === 0) {
      return 'No recent health scores available from connected devices'
    }

    // Get latest day with data
    const latestDay = dailyScores.find(day => 
      day.sleep_score || day.stress_score || day.respiratory_score
    )

    if (!latestDay) {
      return 'No recent health scores available'
    }

    const parts = []
    
    if (latestDay.sleep_score) {
      const sleepContributors = latestDay.sleep_contributors || {}
      parts.push(`Sleep: ${latestDay.sleep_score}/100 (REM: ${sleepContributors.rem || 'N/A'}, Deep: ${sleepContributors.deep || 'N/A'}, Light: ${sleepContributors.light || 'N/A'}, Efficiency: ${sleepContributors.efficiency || 'N/A'}%)`)
    }
    
    if (latestDay.stress_score) {
      const stressContributors = latestDay.stress_contributors || {}
      parts.push(`Stress: ${latestDay.stress_score}/100 (HRV: ${stressContributors.hrv || 'N/A'}, HR: ${stressContributors.hr || 'N/A'})`)
    }
    
    if (latestDay.respiratory_score) {
      const respContributors = latestDay.respiratory_contributors || {}
      const oxygen = respContributors.oxygen_saturation || respContributors.oxy || 'N/A'
      const breathing = respContributors.breathing_regularity || respContributors.respiration || 'N/A'
      parts.push(`Respiratory: ${latestDay.respiratory_score}/100 (O₂: ${oxygen}%, Breathing: ${breathing})`)
    }

    const dateStr = new Date(latestDay.score_date).toLocaleDateString()
    return `Latest health scores (${dateStr}): ${parts.join(' | ')}. ${daysWithData} days of data in last 7 days.`
  }

  private async fetchMedicationsData(): Promise<MentionData> {
    const response = await fetch('/api/mention/medications', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch medications data')
    }

    const data = await response.json()
    
    return {
      type: 'medications',
      summary: data.summary || 'No medications recorded',
      data: data.data || data,
      timestamp: data.timestamp || new Date().toISOString()
    }
  }

  private async fetchLabResultsData(): Promise<MentionData> {
    const response = await fetch('/api/mention/lab-results', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch lab results data')
    }

    const data = await response.json()
    
    return {
      type: 'lab_results',
      summary: data.summary || 'No lab results recorded',
      data: data.data || data,
      timestamp: data.timestamp || new Date().toISOString()
    }
  }

  private async fetchHealthTimelineData(): Promise<MentionData> {
    const response = await fetch('/api/mention/timeline', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch health timeline data')
    }

    const data = await response.json()
    
    return {
      type: 'health_timeline',
      summary: data.summary || 'No health timeline entries recorded',
      data: data.data || data,
      timestamp: data.timestamp || new Date().toISOString()
    }
  }

  private async fetchVitalsData(): Promise<MentionData> {
    const response = await fetch('/api/mention/vitals', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch vitals data')
    }

    const data = await response.json()
    
    return {
      type: 'vitals',
      summary: data.summary || 'No vital signs recorded',
      data: data.data || data,
      timestamp: data.timestamp || new Date().toISOString()
    }
  }

  private formatOuraSummary(data: any): string {
    if (!data?.data?.recent_data) return 'No Oura data available'
    
    // Extract Oura data from Terra API response
    const ouraData = Object.values(data.data.recent_data).find((providerData: any) => 
      Array.isArray(providerData) && providerData.some((item: any) => item.provider === 'OURA')
    ) as any[]
    
    if (!ouraData || ouraData.length === 0) return 'No Oura data available'
    
    // Get latest comprehensive data
    const latestData = ouraData.find(item => item.data_type === 'daily_comprehensive')?.data
    
    if (!latestData) return 'Oura Ring connected - no recent data'
    
    const summary = []
    
    // Extract activity metrics
    if (latestData.activity?.steps) {
      summary.push(`Steps: ${latestData.activity.steps.toLocaleString()}`)
    }
    
    if (latestData.calories?.total_burned) {
      summary.push(`Calories: ${Math.round(latestData.calories.total_burned)}`)
    }
    
    if (latestData.heart_rate?.avg_bpm) {
      summary.push(`Avg HR: ${Math.round(latestData.heart_rate.avg_bpm)} bpm`)
    }
    
    // Extract scores if available
    if (latestData.scores?.recovery) {
      summary.push(`Recovery: ${latestData.scores.recovery}`)
    }
    
    if (latestData.scores?.sleep) {
      summary.push(`Sleep Score: ${latestData.scores.sleep}`)
    }
    
    return summary.length > 0 ? summary.join(', ') : 'Oura Ring data included'
  }

  private formatGoogleFitSummary(data: any): string {
    if (!data?.data?.recent_data) return 'No Google Fit data available'
    
    // Extract Google Fit data from Terra API response
    const googleData = Object.values(data.data.recent_data).find((providerData: any) => 
      Array.isArray(providerData) && providerData.some((item: any) => item.provider === 'GOOGLE')
    ) as any[]
    
    if (!googleData || googleData.length === 0) return 'No Google Fit data available'
    
    // Get latest comprehensive data
    const latestData = googleData.find(item => item.data_type === 'daily_comprehensive')?.data
    
    if (!latestData) return 'Google Fit connected - no recent data'
    
    const summary = []
    
    // Extract activity metrics
    if (latestData.activity?.steps) {
      summary.push(`Steps: ${latestData.activity.steps.toLocaleString()}`)
    }
    
    if (latestData.activity?.distance_meters) {
      const km = (latestData.activity.distance_meters / 1000).toFixed(1)
      summary.push(`Distance: ${km}km`)
    }
    
    if (latestData.calories?.total_burned) {
      summary.push(`Calories: ${Math.round(latestData.calories.total_burned)}`)
    }
    
    if (latestData.heart_rate?.avg_bpm) {
      summary.push(`Avg HR: ${Math.round(latestData.heart_rate.avg_bpm)} bpm`)
    }
    
    if (latestData.activity?.active_duration) {
      const minutes = Math.round(latestData.activity.active_duration / 60)
      summary.push(`Active: ${minutes}min`)
    }
    
    return summary.length > 0 ? summary.join(', ') : 'Google Fit data included'
  }

  private formatMedicationsSummary(data: any): string {
    if (!data || !data.medications || data.medications.length === 0) {
      return 'No current medications'
    }
    
    const activeMeds = data.medications.filter((med: any) => med.currently_taking === true)
    return `${activeMeds.length} active medication(s): ${activeMeds.map((med: any) => med.name).join(', ')}`
  }

  private formatLabResultsSummary(data: any): string {
    if (!data || !data.results || data.results.length === 0) {
      return 'No recent lab results'
    }
    
    const recentResults = data.results.slice(0, 3)
    return `${recentResults.length} recent lab result(s): ${recentResults.map((result: any) => result.test_name).join(', ')}`
  }

  private formatHealthTimelineSummary(data: any): string {
    if (!data || !data.events || data.events.length === 0) {
      return 'No recent health events'
    }
    
    const recentEvents = data.events.slice(0, 3)
    return `${recentEvents.length} recent health event(s): ${recentEvents.map((event: any) => event.event_type).join(', ')}`
  }

  private formatVitalsSummary(data: any): string {
    if (!data || !data.vitals || data.vitals.length === 0) {
      return 'No recent vitals'
    }
    
    const latest = data.vitals[0] || {}
    const summary = []
    
    if (latest.blood_pressure_systolic && latest.blood_pressure_diastolic) {
      summary.push(`BP: ${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic}`)
    }
    if (latest.weight) summary.push(`Weight: ${latest.weight}`)
    if (latest.temperature) summary.push(`Temp: ${latest.temperature}°`)
    if (latest.heart_rate) summary.push(`HR: ${latest.heart_rate} bpm`)
    
    return summary.length > 0 ? summary.join(', ') : 'Vital signs included'
  }

  private async fetchConditionsData(): Promise<MentionData> {
    const response = await fetch('/api/mention/conditions', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch conditions data')
    }

    const data = await response.json()
    
    return {
      type: 'conditions',
      summary: data.summary || 'No pre-existing conditions recorded',
      data: data.data || data,
      timestamp: data.timestamp || new Date().toISOString()
    }
  }

  private formatConditionsSummary(data: any): string {
    if (!data || !data.conditions || data.conditions.length === 0) {
      return 'No pre-existing conditions recorded'
    }
    
    const conditions = data.conditions.slice(0, 3)
    const conditionNames = conditions.map((condition: any) => condition.display_name)
    
    if (data.conditions.length > 3) {
      return `${data.conditions.length} conditions including: ${conditionNames.join(', ')}`
    } else {
      return `${data.conditions.length} condition(s): ${conditionNames.join(', ')}`
    }
  }
}

export { MentionDataService }
export default MentionDataService
export type { MentionData }