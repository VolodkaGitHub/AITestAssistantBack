import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { healthTimelineDB } from '../../lib/health-timeline-database'
import { authDB } from '../../lib/auth-database'

interface SaveHealthTimelineRequest {
  sessionId: string
  symptoms: string[]
  findings: string
  differentialDiagnoses: any[]
  chatHistory: any[]
  chatSummary?: string
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Initialize database schema
    await healthTimelineDB.initializeSchema()

    // Get session token from headers
    const sessionToken = req.headers.authorization?.replace('Bearer ', '')
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    // Verify session and get user
    const user = await authDB.validateSession(sessionToken)
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    const {
      sessionId,
      symptoms,
      findings,
      differentialDiagnoses,
      chatHistory,
      chatSummary
    }: SaveHealthTimelineRequest = req.body

    // Validate required fields
    if (!sessionId || !symptoms || !Array.isArray(symptoms)) {
      return res.status(400).json({ error: 'Session ID and symptoms are required' })
    }

    if (!differentialDiagnoses || !Array.isArray(differentialDiagnoses)) {
      return res.status(400).json({ error: 'Differential diagnoses are required' })
    }

    // Prepare top 5 differential diagnoses
    const topDifferentialDiagnoses = differentialDiagnoses
      .slice(0, 5)
      .map(diagnosis => ({
        condition: diagnosis.diagnosis?.display_name || diagnosis.condition || 'Unknown',
        probability: diagnosis.probability || 0,
        medicalTerm: diagnosis.diagnosis?.display_name || diagnosis.medicalTerm || 'Unknown',
        laymanTerm: diagnosis.diagnosis?.display_name_layman || diagnosis.laymanTerm || 'Unknown'
      }))

    // Generate chat summary if not provided
    let finalChatSummary = chatSummary
    if (!finalChatSummary && chatHistory && chatHistory.length > 0) {
      finalChatSummary = generateChatSummary(symptoms, findings, topDifferentialDiagnoses, chatHistory)
    }

    // Create health timeline entry
    const timelineEntry = {
      userId: user.id,
      sessionId,
      date: new Date().toLocaleDateString('en-CA'), // Current date in YYYY-MM-DD format (en-CA gives ISO format)
      symptoms,
      findings: findings || `Patient reported: ${symptoms.join(', ')}`,
      topDifferentialDiagnoses,
      chatSummary: finalChatSummary || `Consultation regarding ${symptoms.join(', ')}`,
      fullChatHistory: chatHistory
    }

    // Save to database
    const entryId = await healthTimelineDB.saveHealthTimelineEntry(timelineEntry)

    res.status(200).json({
      success: true,
      message: 'Health timeline entry saved successfully',
      entryId,
      entry: {
        id: entryId,
        date: timelineEntry.date,
        symptoms: timelineEntry.symptoms,
        findings: timelineEntry.findings,
        topDifferentialDiagnoses: timelineEntry.topDifferentialDiagnoses,
        chatSummary: timelineEntry.chatSummary
      }
    })

  } catch (error) {
    console.error('Save health timeline error:', error)
    res.status(500).json({ error: 'Failed to save health timeline entry' })
  }
}

function generateChatSummary(
  symptoms: string[], 
  findings: string, 
  diagnoses: any[], 
  chatHistory: any[]
): string {
  const symptomsText = symptoms.length > 0 ? symptoms.join(', ') : 'various symptoms'
  const topCondition = diagnoses.length > 0 ? diagnoses[0].condition : 'condition assessment'
  
  let summary = `Medical consultation regarding ${symptomsText}. `
  
  if (findings) {
    summary += `Key findings: ${findings}. `
  }
  
  if (diagnoses.length > 0) {
    summary += `Primary consideration: ${topCondition}`
    if (diagnoses[0].probability) {
      summary += ` (${Math.round(diagnoses[0].probability)}% probability)`
    }
    summary += '. '
  }
  
  if (diagnoses.length > 1) {
    const otherConditions = diagnoses.slice(1, 3).map(d => d.condition).join(', ')
    summary += `Other considerations include: ${otherConditions}. `
  }
  
  const messageCount = chatHistory ? chatHistory.length : 0
  summary += `Consultation included ${messageCount} exchanges with comprehensive diagnostic analysis.`
  
  return summary
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}