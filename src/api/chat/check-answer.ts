import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

interface CheckAnswerRequest {
  userMessage: string
  question: string
  answerList: string[]
}

interface CheckAnswerResponse {
  answered: boolean
  answerIndex: number | null
  confidence: number
}

/**
 * @openapi
 * /api/chat/check-answer:
 *   post:
 *     summary: Analyze user’s answer to a diagnostic question
 *     description: |
 *       Accepts a user message, a diagnostic question, and a list of possible answers.
 *       Returns whether the user answered the question, the index of the matched answer, and confidence score.
 *     tags:
 *       - Chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userMessage
 *               - question
 *               - answerList
 *             properties:
 *               userMessage:
 *                 type: string
 *                 example: "Yes, I have severe chest pain"
 *               question:
 *                 type: string
 *                 example: "Do you have chest pain?"
 *               answerList:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example:
 *                   - "Yes, I have pain"
 *                   - "No, I don't have pain"
 *     responses:
 *       200:
 *         description: Successful answer analysis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 answered:
 *                   type: boolean
 *                   description: Whether the user answered the question
 *                   example: true
 *                 answerIndex:
 *                   type: integer
 *                   nullable: true
 *                   description: Index of the matched answer in answerList if answered is true
 *                   example: 0
 *                 confidence:
 *                   type: number
 *                   format: float
 *                   description: Confidence score between 0 and 1
 *                   example: 0.95
 *       400:
 *         description: Bad request (missing or invalid fields)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User message, question, and answer list are required"
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CheckAnswerResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userMessage, question, answerList }: CheckAnswerRequest = req.body

    if (!userMessage || !question || !answerList || answerList.length === 0) {
      return res.status(400).json({ error: 'User message, question, and answer list are required' })
    }

    // Create prompt to determine if user answered the question
    const prompt = `You are analyzing whether a patient's response answers a specific diagnostic question.

DIAGNOSTIC QUESTION: "${question}"

AVAILABLE ANSWERS:
${answerList.map((answer, index) => `${index}: ${answer}`).join('\n')}

PATIENT'S RESPONSE: "${userMessage}"

Analyze if the patient's response answers the diagnostic question. If it does, determine which answer index (0-${answerList.length - 1}) best matches their response.

Respond with ONLY a JSON object in this exact format:
{
  "answered": true/false,
  "answerIndex": number or null,
  "confidence": number between 0-1,
  "reasoning": "brief explanation"
}

Examples:
- If question is "Do you have chest pain?" and patient says "Yes, I have severe chest pain" → {"answered": true, "answerIndex": 0, "confidence": 0.95, "reasoning": "Clear affirmative response"}
- If question is "How often does this occur?" and patient says "I also have a headache" → {"answered": false, "answerIndex": null, "confidence": 0.1, "reasoning": "Response doesn't address frequency"}
- If question is "Is the pain sharp or dull?" and patient says "It's more of a stabbing sensation" → {"answered": true, "answerIndex": 0, "confidence": 0.8, "reasoning": "Stabbing indicates sharp pain"}

Be strict: only mark as answered if the response clearly addresses the specific question asked.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: prompt
        },
        {
          role: "user", 
          content: `Analyze this response: "${userMessage}"`
        }
      ],
      max_tokens: 200,
      temperature: 0.1
    })

    const responseText = completion.choices[0]?.message?.content?.trim()
    
    if (!responseText) {
      return res.status(500).json({ error: 'No response from AI' })
    }

    try {
      // Parse the JSON response from OpenAI
      const analysis = JSON.parse(responseText)
      
      // Validate the response structure
      if (typeof analysis.answered !== 'boolean') {
        throw new Error('Invalid answered field')
      }
      
      if (analysis.answered && (analysis.answerIndex === null || analysis.answerIndex === undefined)) {
        throw new Error('Answer index required when answered is true')
      }

      if (analysis.answered && (analysis.answerIndex < 0 || analysis.answerIndex >= answerList.length)) {
        throw new Error('Answer index out of range')
      }

      return res.status(200).json({
        answered: analysis.answered,
        answerIndex: analysis.answered ? analysis.answerIndex : null,
        confidence: analysis.confidence || 0
      })

    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', responseText, parseError)
      // Fallback: assume not answered if parsing fails
      return res.status(200).json({
        answered: false,
        answerIndex: null,
        confidence: 0
      })
    }

  } catch (error) {
    console.error('Check answer error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}