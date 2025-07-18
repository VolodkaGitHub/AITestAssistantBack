import { DatabasePool } from './database-pool';

export interface HealthContextData {
  medications: {
    total_count: number
    current: Array<{
      id: string
      name: string
      dosage: string
      frequency: string
      started_date: string
      is_active: boolean
    }>
  }
  labs: {
    total_count: number
    latest: {
      test_name: string
      date: string
      status: 'normal' | 'abnormal' | 'critical'
    } | null
  }
  wearables: {
    connections: Array<{
      device_name: string
      device_type: string
      last_sync: string
      status: string
    }>
    latest_data: {
      heart_rate?: number
      steps?: number
      sleep_hours?: number
      activity_minutes?: number
      last_updated?: string
      note?: string
    } | null
  }
  timeline: {
    total_events: number
    latest_event: {
      event_type: string
      title: string
      date: string
      summary?: string
    } | null
  }
}

export async function getHealthContextForUser(userId: string): Promise<string> {
  try {
    console.log('🏥 Getting health context for user:', userId)
    const healthData = await fetchUserHealthData(userId)
    const formattedContext = formatHealthContextForAI(healthData)
    console.log('🏥 Health context formatted successfully, length:', formattedContext.length)
    return formattedContext
  } catch (error) {
    console.error('🏥 Error fetching health context:', error)
    return ''
  }
}

async function fetchUserHealthData(userId: string): Promise<HealthContextData> {
  // Using DatabasePool.getClient() directly
  const client = await DatabasePool.getClient()
  
  try {
    // Get current medications
    const medicationsResult = await client.query(`
      SELECT 
        id,
        name,
        dosage,
        frequency,
        start_date as started_date,
        CASE WHEN status = 'currently_taking' THEN true ELSE false END as is_active
      FROM user_medications 
      WHERE user_id = $1 
      ORDER BY start_date DESC NULLS LAST, name ASC
    `, [userId])

    const medications = medicationsResult.rows.map(med => ({
      id: med.id.toString(),
      name: med.name,
      dosage: med.dosage || '',
      frequency: med.frequency || '',
      started_date: med.started_date || '',
      is_active: med.is_active
    }))

    // Get latest lab results (sample data for now - replace with real lab data when available)
    const labs = {
      total_count: 1,
      latest: {
        test_name: 'Comprehensive Metabolic Panel',
        date: '2025-01-01',
        status: 'normal' as const
      }
    }

    // Get wearable connections and data
    const wearablesResult = await client.query(`
      SELECT provider as device_name, 'wearable' as device_type, last_sync, 
             CASE WHEN is_active THEN 'connected' ELSE 'disconnected' END as status
      FROM wearable_connections 
      WHERE user_id = $1 AND is_active = true
    `, [userId])

    const wearableConnections = wearablesResult.rows || []

    // Get latest wearable data (sample data for now - replace with real data when available)
    const wearableData = wearableConnections.length > 0 ? {
      heart_rate: 72,
      steps: 8500,
      sleep_hours: 7.5,
      activity_minutes: 45,
      last_updated: new Date().toISOString()
    } : null

    // Get latest health timeline event
    const timelineResult = await client.query(`
      SELECT 
        'diagnostic_session' as event_type,
        COALESCE(chat_summary, 'Diagnostic session') as title,
        created_at as date
      FROM health_timeline 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [userId])

    const latestEvent = timelineResult.rows[0] || null

    // Get total timeline events count
    const timelineCountResult = await client.query(`
      SELECT COUNT(*) as total
      FROM health_timeline 
      WHERE user_id = $1
    `, [userId])

    const totalEvents = parseInt(timelineCountResult.rows[0]?.total || '0')

    return {
      medications: {
        total_count: medications.length,
        current: medications
      },
      labs,
      wearables: {
        connections: wearableConnections,
        latest_data: wearableData
      },
      timeline: {
        total_events: totalEvents,
        latest_event: latestEvent
      }
    }

  } finally {
    client.release()
  }
}

function formatHealthContextForAI(healthData: HealthContextData): string {
  const sections = []

  // Current Medications - match exact format from Health Check tiles
  sections.push(`**Current Medications:**`)
  sections.push(`${healthData.medications.total_count} total medications`)
  
  if (healthData.medications.current.length > 0) {
    // Show top 3 medications as displayed in UI
    const displayMeds = healthData.medications.current.slice(0, 3)
    displayMeds.forEach(med => {
      sections.push(`- ${med.name}`)
      sections.push(`  ${med.dosage || 'Dosage not specified'} - ${med.frequency || 'Frequency not specified'}`)
      sections.push(`  Status: ${med.is_active ? 'Active' : 'Inactive'}`)
    })
    
    if (healthData.medications.current.length > 3) {
      sections.push(`+${healthData.medications.current.length - 3} more medications`)
    }
  } else {
    sections.push(`No current medications`)
  }
  sections.push('')

  // Latest Lab Results - match exact format from Health Check tiles  
  sections.push(`**Latest Lab Results:**`)
  sections.push(`${healthData.labs.total_count} total lab results`)
  
  if (healthData.labs.latest) {
    const labDate = new Date(healthData.labs.latest.date).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric' 
    })
    sections.push(`- ${healthData.labs.latest.test_name}`)
    sections.push(`  Date: ${labDate}`)
    sections.push(`  Status: ${healthData.labs.latest.status}${healthData.labs.latest.status !== 'normal' ? ' (Out of Range)' : ''}`)
  } else {
    sections.push(`No lab results available`)
  }
  sections.push('')

  // Wearable Devices - match exact format from Health Check tiles
  sections.push(`**Wearable Devices:**`)
  sections.push(`${healthData.wearables.connections.length} connected devices`)
  
  if (healthData.wearables.connections.length > 0) {
    healthData.wearables.connections.forEach(device => {
      sections.push(`- ${device.device_name}`)
      if (device.last_sync) {
        const syncDate = new Date(device.last_sync).toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true 
        })
        sections.push(`  Last sync: ${syncDate}`)
      }
      sections.push(`  Status: ${device.status}`)
    })
    
    // Add latest wearable data if available
    if (healthData.wearables.latest_data) {
      sections.push(`Latest Data:`)
      const data = healthData.wearables.latest_data
      if (data.heart_rate) sections.push(`  Heart Rate: ${data.heart_rate} bpm`)
      if (data.steps) sections.push(`  Steps: ${data.steps.toLocaleString()}`)
      if (data.sleep_hours) sections.push(`  Sleep: ${data.sleep_hours}h`)
      if (data.activity_minutes) sections.push(`  Activity: ${data.activity_minutes}m`)
    }
  } else {
    sections.push(`No wearable devices connected`)
  }
  sections.push('')

  // Health Timeline - match exact format from Health Check tiles
  sections.push(`**Health Timeline:**`)
  sections.push(`${healthData.timeline.total_events} total events`)
  
  if (healthData.timeline.latest_event) {
    const event = healthData.timeline.latest_event
    const eventDate = new Date(event.date).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true 
    })
    sections.push(`- ${event.title}`)
    if (event.summary) sections.push(`  ${event.summary}`)
    sections.push(`  Date: ${eventDate}`)
    if (event.event_type) {
      const eventTypeFormatted = event.event_type.replace('_', ' ')
      sections.push(`  Type: ${eventTypeFormatted}`)
    }
  } else {
    sections.push(`No recent health events`)
  }

  return sections.join('\n')
}