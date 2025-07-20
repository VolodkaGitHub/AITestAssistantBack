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

/**
 * @openapi
 * /api/health-timeline/save:
 *   post:
 *     summary: Save a new health timeline entry
 *     description: Saves a health timeline entry for the authenticated user including symptoms, findings, differential diagnoses, and chat history.
 *     tags:
 *       - HealthTimeline
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Health timeline entry data to save
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - symptoms
 *               - differentialDiagnoses
 *             properties:
 *               sessionId:
 *                 type: string
 *                 example: "session_abc123"
 *               symptoms:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["headache", "fatigue"]
 *               findings:
 *                 type: string
 *                 example: "Patient reported mild headache and fatigue."
 *               differentialDiagnoses:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     diagnosis:
 *                       type: object
 *                       properties:
 *                         display_name:
 *                           type: string
 *                           example: "Migraine"
 *                         display_name_layman:
 *                           type: string
 *                           example: "Headache"
 *                     condition:
 *                       type: string
 *                       example: "Migraine"
 *                     probability:
 *                       type: number
 *                       example: 75
 *                     medicalTerm:
 *                       type: string
 *                       example: "Migraine"
 *                     laymanTerm:
 *                       type: string
 *                       example: "Headache"
 *               chatHistory:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *               chatSummary:
 *                 type: string
 *                 example: "Patient consultation summary."
 *     responses:
 *       '200':
 *         description: Timeline entry saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Health timeline entry saved successfully"
 *                 entryId:
 *                   type: integer
 *                   example: 101
 *                 entry:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 101
 *                     date:
 *                       type: string
 *                       format: date
 *                       example: "2025-07-20"
 *                     symptoms:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["headache", "fatigue"]
 *                     findings:
 *                       type: string
 *                       example: "Patient reported mild headache and fatigue."
 *                     topDifferentialDiagnoses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           condition:
 *                             type: string
 *                             example: "Migraine"
 *                           probability:
 *                             type: number
 *                             example: 75
 *                           medicalTerm:
 *                             type: string
 *                             example: "Migraine"
 *                           laymanTerm:
 *                             type: string
 *                             example: "Headache"
 *                     chatSummary:
 *                       type: string
 *                       example: "Patient consultation summary."
 *       '400':
 *         description: Missing required fields or validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Session ID and symptoms are required"
 *       '401':
 *         description: Unauthorized - missing or invalid session token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       '405':
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to save health timeline entry"
 */

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