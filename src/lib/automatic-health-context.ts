import { DatabasePool } from './database-pool';

export interface AutomaticHealthContext {
  enrichmentScores: {
    last7Days: Array<{
      date: string
      sleepScore: number | null
      stressScore: number | null
      respiratoryScore: number | null
      contributors: any
    }>
    averages: {
      sleep: number | null
      stress: number | null
      respiratory: number | null
    }
  }
  medications: Array<{
    name: string
    dosage: string
    frequency: string
    startedDate: string
  }>
  conditions: Array<{
    name: string
    category: string
    addedDate: string
  }>
  demographics: {
    age: number | null
    sex: string | null
  }
}

export async function getAutomaticHealthContext(userId: string): Promise<string> {
  try {
    console.log('🏥 Fetching automatic health context for user:', userId)
    const healthData = await fetchAutomaticHealthData(userId)
    const formattedContext = formatAutomaticHealthContext(healthData)
    console.log('🏥 Automatic health context formatted successfully, length:', formattedContext.length)
    return formattedContext
  } catch (error) {
    console.error('🏥 Error fetching automatic health context:', error instanceof Error ? error.message : String(error))
    return ''
  }
}

async function fetchAutomaticHealthData(userId: string): Promise<AutomaticHealthContext> {
  // Using DatabasePool.getClient() directly
  const client = await DatabasePool.getClient()
  
  try {
    // Get last 7 days of enrichment scores
    const enrichmentResult = await client.query(`
      SELECT 
        score_date,
        sleep_score,
        stress_score,
        respiratory_score,
        sleep_contributors,
        stress_contributors,
        respiratory_contributors
      FROM daily_health_scores 
      WHERE user_id = $1 
        AND score_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY score_date DESC
    `, [userId])

    const enrichmentScores = enrichmentResult.rows.map(row => ({
      date: row.score_date,
      sleepScore: row.sleep_score,
      stressScore: row.stress_score,
      respiratoryScore: row.respiratory_score,
      contributors: {
        sleep: row.sleep_contributors,
        stress: row.stress_contributors,
        respiratory: row.respiratory_contributors
      }
    }))

    // Calculate averages for last 7 days
    const validSleepScores = enrichmentScores.filter(s => s.sleepScore !== null).map(s => s.sleepScore!)
    const validStressScores = enrichmentScores.filter(s => s.stressScore !== null).map(s => s.stressScore!)
    const validRespiratoryScores = enrichmentScores.filter(s => s.respiratoryScore !== null).map(s => s.respiratoryScore!)

    const averages = {
      sleep: validSleepScores.length > 0 ? Math.round(validSleepScores.reduce((a, b) => a + b, 0) / validSleepScores.length * 10) / 10 : null,
      stress: validStressScores.length > 0 ? Math.round(validStressScores.reduce((a, b) => a + b, 0) / validStressScores.length * 10) / 10 : null,
      respiratory: validRespiratoryScores.length > 0 ? Math.round(validRespiratoryScores.reduce((a, b) => a + b, 0) / validRespiratoryScores.length * 10) / 10 : null
    }

    // Get current medications
    const medicationsResult = await client.query(`
      SELECT 
        name,
        dosage,
        frequency,
        start_date as started_date
      FROM user_medications 
      WHERE user_id = $1 AND status = 'currently_taking'
      ORDER BY name ASC
    `, [userId])

    const medications = medicationsResult.rows.map(row => ({
      name: row.name,
      dosage: row.dosage || 'Not specified',
      frequency: row.frequency || 'Not specified',
      startedDate: row.started_date || 'Unknown'
    }))

    // Get pre-existing conditions
    const conditionsResult = await client.query(`
      SELECT 
        uc.condition_id,
        cl.display_name as name,
        uc.created_at as date_added
      FROM user_conditions uc
      LEFT JOIN conditions_library cl ON uc.condition_id = cl.id
      WHERE uc.user_id = $1 AND uc.is_active = true
      ORDER BY uc.created_at DESC
    `, [userId])

    const conditions = conditionsResult.rows.map(row => ({
      name: row.name,
      category: 'Medical Condition',
      addedDate: row.date_added || 'Unknown'
    }))

    // Get user demographics (calculate age from date_of_birth)
    let demographics = {
      age: null,
      sex: null
    }
    
    try {
      const userResult = await client.query(`
        SELECT 
          date_of_birth,
          gender_at_birth,
          CASE 
            WHEN date_of_birth IS NOT NULL THEN 
              EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth))::INTEGER
            ELSE NULL 
          END as calculated_age
        FROM users 
        WHERE id = $1
      `, [userId])
      
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0]
        demographics = {
          age: user.calculated_age || null,
          sex: user.gender_at_birth || null
        }
      }
    } catch (error) {
      console.log('Error fetching user demographics:', error instanceof Error ? error.message : String(error))
      // Fallback to basic query if date_of_birth or gender columns don't exist
      try {
        const basicResult = await client.query(`
          SELECT id FROM users WHERE id = $1
        `, [userId])
        console.log('User exists but demographics columns not available')
      } catch (basicError) {
        console.log('User demographics unavailable')
      }
    }

    return {
      enrichmentScores: {
        last7Days: enrichmentScores,
        averages
      },
      medications,
      conditions,
      demographics
    }

  } finally {
    client.release()
  }
}

function formatAutomaticHealthContext(healthData: AutomaticHealthContext): string {
  const sections = []

  // Demographics
  sections.push(`**Patient Demographics:**`)
  if (healthData.demographics.age || healthData.demographics.sex) {
    if (healthData.demographics.age) {
      sections.push(`Age: ${healthData.demographics.age} years`)
    }
    if (healthData.demographics.sex) {
      sections.push(`Sex: ${healthData.demographics.sex}`)
    }
  } else {
    sections.push(`Demographics not provided`)
  }
  sections.push('')

  // Last 7 days health scores
  sections.push(`**Recent Health Scores (Last 7 Days):**`)
  if (healthData.enrichmentScores.last7Days.length > 0) {
    // Show averages first
    const { averages } = healthData.enrichmentScores
    sections.push(`7-Day Averages:`)
    if (averages.sleep !== null) sections.push(`- Sleep Score: ${averages.sleep}/100`)
    if (averages.stress !== null) sections.push(`- Stress Score: ${averages.stress}/100`)
    if (averages.respiratory !== null) sections.push(`- Respiratory Score: ${averages.respiratory}/100`)
    
    sections.push('')
    sections.push(`Daily Breakdown:`)
    
    // Show last 3 days for brevity
    const recentDays = healthData.enrichmentScores.last7Days.slice(0, 3)
    recentDays.forEach(day => {
      const date = new Date(day.date).toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric' 
      })
      sections.push(`${date}:`)
      if (day.sleepScore !== null) sections.push(`  Sleep: ${day.sleepScore}/100`)
      if (day.stressScore !== null) sections.push(`  Stress: ${day.stressScore}/100`)
      if (day.respiratoryScore !== null) sections.push(`  Respiratory: ${day.respiratoryScore}/100`)
    })
    
    if (healthData.enrichmentScores.last7Days.length > 3) {
      sections.push(`+${healthData.enrichmentScores.last7Days.length - 3} more days of data available`)
    }
  } else {
    sections.push(`No recent health scores available`)
  }
  sections.push('')

  // Current medications
  sections.push(`**Current Medications:**`)
  if (healthData.medications.length > 0) {
    healthData.medications.forEach(med => {
      sections.push(`- ${med.name}`)
      sections.push(`  Dosage: ${med.dosage}`)
      sections.push(`  Frequency: ${med.frequency}`)
      if (med.startedDate !== 'Unknown') {
        const startDate = new Date(med.startedDate).toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric', year: 'numeric' 
        })
        sections.push(`  Started: ${startDate}`)
      }
    })
  } else {
    sections.push(`No current medications`)
  }
  sections.push('')

  // Pre-existing conditions
  sections.push(`**Pre-existing Conditions:**`)
  if (healthData.conditions.length > 0) {
    healthData.conditions.forEach(condition => {
      sections.push(`- ${condition.name}`)
      sections.push(`  Category: ${condition.category}`)
      if (condition.addedDate !== 'Unknown') {
        const addedDate = new Date(condition.addedDate).toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric', year: 'numeric' 
        })
        sections.push(`  Added: ${addedDate}`)
      }
    })
  } else {
    sections.push(`No pre-existing conditions on record`)
  }
  sections.push('')

  return sections.join('\n')
}