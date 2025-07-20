import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'
import { withScalableMiddleware } from '../../lib/api-middleware'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

/**
 * Fallback diagnostic session creation when Merlin API is unavailable
 * Uses OpenAI directly for medical analysis while maintaining chat functionality
 */

/**
 * @openapi
 * /api/diagnostic/fallback-session:
 *   post:
 *     summary: Create fallback diagnostic session using OpenAI
 *     description: |
 *       This endpoint is used when the main Merlin diagnostic service is unavailable. It takes user symptoms and uses OpenAI to generate a differential diagnosis and a relevant diagnostic question.
 *     tags:
 *       - Diagnostic
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - initialSymptoms
 *             properties:
 *               initialSymptoms:
 *                 type: string
 *                 description: Symptoms provided by the user.
 *                 example: "Headache, dizziness, nausea"
 *               sessionToken:
 *                 type: string
 *                 description: Optional token to validate session context.
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Fallback diagnostic session created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                   example: "fallback_1721458945123_abc9xy7yz"
 *                 differentialDiagnosis:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       diagnosis:
 *                         type: object
 *                         properties:
 *                           display_name:
 *                             type: string
 *                             example: "Migraine"
 *                           display_name_layman:
 *                             type: string
 *                             example: "Severe headache"
 *                       probability:
 *                         type: number
 *                         format: float
 *                         example: 0.6
 *                 firstQuestion:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     question:
 *                       type: string
 *                       example: "Is the headache localized or generalized?"
 *                     answerList:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Localized", "Generalized", "Comes and goes", "Not sure"]
 *                 fallbackMode:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Diagnostic session created in fallback mode due to server unavailability"
 *       400:
 *         description: Missing or invalid input.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing symptoms"
 *       405:
 *         description: Method not allowed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Internal server error while creating fallback session.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to create fallback diagnostic session"
 *                 details:
 *                   type: string
 *                   example: "Unexpected token < in JSON at position 0"
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('🏥 FALLBACK DIAGNOSTIC SESSION - Creating OpenAI-based session')
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { initialSymptoms, sessionToken } = req.body
    
    if (!initialSymptoms) {
      return res.status(400).json({ error: 'Missing symptoms' })
    }

    // Validate session if provided
    let authenticatedUser = null
    if (sessionToken) {
      try {
        const sessionResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:5000'}/api/auth/validate-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken })
        })
        
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json()
          authenticatedUser = sessionData.user
        }
      } catch (error) {
        console.log('Session validation failed, proceeding with fallback session')
      }
    }

    // Generate a fallback session ID
    const fallbackSessionId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Generate initial differential diagnosis using OpenAI
    const diagnosisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a medical AI assistant. Given patient symptoms, provide potential differential diagnoses.

Return a JSON array of potential diagnoses with this exact format:
[
  {
    "diagnosis": {
      "display_name": "Medical Term",
      "display_name_layman": "Simple description"
    },
    "probability": 0.7
  }
]

Include 3-5 potential diagnoses ordered by probability. Probabilities should be realistic medical estimates between 0.1-0.8.`
        },
        {
          role: "user",
          content: `Patient presents with: ${initialSymptoms}`
        }
      ],
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" }
    })

    let differentialDiagnosis = []
    try {
      const aiResponse = JSON.parse(diagnosisResponse.choices[0].message.content || '[]')
      differentialDiagnosis = Array.isArray(aiResponse) ? aiResponse : aiResponse.diagnoses || []
    } catch (error) {
      console.log('Error parsing AI diagnosis response, using fallback')
      differentialDiagnosis = [
        {
          diagnosis: {
            display_name: "Symptom Assessment Required",
            display_name_layman: "Further evaluation needed"
          },
          probability: 0.5
        }
      ]
    }

    // Generate initial diagnostic question
    const questionResponse = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
        {
          role: "system",
          content: `You are a medical AI generating diagnostic questions. Create one relevant follow-up question with multiple choice answers.

Return JSON in this exact format:
{
  "question": "Your diagnostic question here?",
  "answerList": ["Option 1", "Option 2", "Option 3", "Option 4"]
}

Make the question specific to the symptoms and medically relevant.`
        },
        {
          role: "user",
          content: `Based on these symptoms: ${initialSymptoms}

Generate an appropriate diagnostic question.`
        }
      ],
      max_tokens: 500,
      temperature: 0.3,
      response_format: { type: "json_object" }
    })

    let firstQuestion = null
    try {
      firstQuestion = JSON.parse(questionResponse.choices[0].message.content || '{}')
      if (!firstQuestion.question || !firstQuestion.answerList) {
        firstQuestion = null
      }
    } catch (error) {
      console.log('Error parsing AI question response')
      firstQuestion = null
    }

    console.log('✅ FALLBACK SESSION CREATED:', {
      sessionId: fallbackSessionId,
      diagnosisCount: differentialDiagnosis.length,
      hasQuestion: !!firstQuestion
    })

    res.status(200).json({
      sessionId: fallbackSessionId,
      differentialDiagnosis,
      firstQuestion,
      fallbackMode: true,
      message: "Diagnostic session created in fallback mode due to server unavailability"
    })

  } catch (error) {
    console.error('Fallback session creation failed:', error)
    res.status(500).json({
      error: 'Failed to create fallback diagnostic session',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}