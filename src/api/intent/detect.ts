import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface IntentDetectionResult {
  isDiagnostic: boolean
  confidence: number
  reasoning: string
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userMessage } = req.body

    if (!userMessage) {
      return res.status(400).json({ error: 'User message is required' })
    }



    // Quick heuristic check first (no API call)
    const diagnosticKeywords = [
      'i have', 'i feel', 'i am experiencing', 'my symptoms', 'i think i have',
      'what could this be', 'diagnose', 'something wrong', 'not feeling well',
      'pain in', 'hurts', 'ache', 'symptoms', 'sick', 'ill', 'dizzy',
      'nausea', 'fever', 'cough', 'headache', 'chest pain', 'stomach',
      'throat', 'runny nose', 'fatigue', 'tired', 'weak', 'rash',
      'swollen', 'bleeding', 'shortness of breath', 'difficulty breathing'
    ]
    
    const lowerMessage = userMessage.toLowerCase()
    const quickCheck = diagnosticKeywords.some(keyword => lowerMessage.includes(keyword))
    
    if (quickCheck) {
      return res.status(200).json({
        isDiagnostic: true,
        confidence: 85,
        reasoning: 'Quick heuristic check detected diagnostic keywords'
      })
    }

    // Use AI intent detection for edge cases
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using smaller model for efficiency
      messages: [
        {
          role: 'system',
          content: `You are a medical intent classifier. Analyze if the user is trying to diagnose a medical condition or symptom versus asking general questions.

DIAGNOSTIC INTENT indicators:
- Describing symptoms (pain, discomfort, unusual sensations)
- Asking about medical conditions or diseases
- Seeking medical advice or diagnosis
- Describing physical or mental health issues
- Asking "what could this be" about health symptoms
- Medical emergency situations

GENERAL INTENT indicators:
- General health education questions
- Asking about medications or treatments conceptually
- Questions about specific medications ("tell me about this med")
- Information requests about health data or medical records
- Questions that reference user's existing health data or medications
- Requests for information about treatments, drugs, or medical concepts
- Health prevention or wellness questions
- Medical research or learning
- General medical knowledge
- Questions that include context about user's current health status without describing new symptoms

Respond with JSON only:
{
  "isDiagnostic": boolean,
  "confidence": number (0-100),
  "reasoning": "brief explanation"
}`
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: 150,
      temperature: 0.1,
      response_format: { type: "json_object" }
    })

    const result = JSON.parse(response.choices[0].message.content || '{}')
    
    res.status(200).json({
      isDiagnostic: result.isDiagnostic || false,
      confidence: result.confidence || 0,
      reasoning: result.reasoning || 'No reasoning provided'
    })

  } catch (error) {
    console.error('Intent detection error:', error)
    // Conservative fallback - assume general intent on error
    res.status(200).json({
      isDiagnostic: false,
      confidence: 0,
      reasoning: 'Error during intent detection'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}