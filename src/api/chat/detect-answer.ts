import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

interface AnswerDetectionResult {
  answered: boolean
  answerIndex: number | null
  confidence: number
  explanation: string
}

/**
 * @openapi
 * /api/answer-detection:
 *   post:
 *     summary: Detect if user answered a diagnostic question
 *     description: |
 *       Accepts a user message and a diagnostic question with answer options.
 *       Returns whether the user answered, which option matches, confidence score, and explanation.
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
 *               - diagnosticQuestion
 *             properties:
 *               userMessage:
 *                 type: string
 *                 example: "Yes, I've been having chest pain"
 *               diagnosticQuestion:
 *                 type: object
 *                 required:
 *                   - question
 *                   - answerList
 *                 properties:
 *                   question:
 *                     type: string
 *                     example: "Do you have chest pain?"
 *                   answerList:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example:
 *                       - "No"
 *                       - "Yes"
 *     responses:
 *       200:
 *         description: Successful answer detection
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
 *                   description: Index of the matched answer option if answered is true
 *                   example: 1
 *                 confidence:
 *                   type: number
 *                   format: float
 *                   description: Confidence score between 0 and 100
 *                   example: 95
 *                 explanation:
 *                   type: string
 *                   description: Brief explanation of the reasoning
 *                   example: "User confirmed having chest pain, which corresponds to 'Yes'"
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing diagnostic question data"
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
 *                   example: "Answer detection failed"
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userMessage, diagnosticQuestion } = req.body

    if (!diagnosticQuestion?.question || !diagnosticQuestion?.answerList) {
      return res.status(400).json({ error: 'Missing diagnostic question data' })
    }

    const answerOptions = diagnosticQuestion.answerList.map((option: string, index: number) => 
      `${index}: ${option}`
    ).join('\n')

    const detectionPrompt = `Analyze the user's message to determine if they answered this diagnostic question:

QUESTION: "${diagnosticQuestion.question}"

ANSWER OPTIONS:
${answerOptions}

USER MESSAGE: "${userMessage}"

Determine if the user's message contains an answer to the diagnostic question. Look for:
- Direct answers using the exact option words
- Synonyms or similar meanings (e.g., "no" = "absent", "yes" = "present")
- Implicit answers based on context

Respond with a JSON object containing:
- answered: boolean (true if an answer was detected)
- answerIndex: number or null (the index of the selected answer option)
- confidence: number (0-100, how confident you are in the detection)
- explanation: string (brief explanation of your reasoning)

Examples:
- "No, I don't have chest pain" → {"answered": true, "answerIndex": 0, "confidence": 95, "explanation": "User clearly stated 'No' which corresponds to 'Absent'"}
- "Yes, I've been having chest pain" → {"answered": true, "answerIndex": 1, "confidence": 95, "explanation": "User confirmed having chest pain, which corresponds to 'Present'"}
- "I'm not sure about that" → {"answered": false, "answerIndex": null, "confidence": 85, "explanation": "User expressed uncertainty, no clear answer detected"}

Be strict - only detect answers when you're confident (>70% confidence) that the user is responding to the specific question.`

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a precise medical question answer detector. Always respond with valid JSON only." },
        { role: "user", content: detectionPrompt }
      ],
      max_tokens: 200,
      temperature: 0.1
    })

    const responseText = response.choices[0]?.message?.content?.trim()
    
    if (!responseText) {
      throw new Error('No response from OpenAI')
    }

    // Parse the JSON response (handle markdown code blocks)
    let result: AnswerDetectionResult
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseText.replace(/```json\n?|```\n?/g, '').trim()
      result = JSON.parse(cleanedResponse)
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', responseText)
      throw new Error('Invalid JSON response from OpenAI')
    }

    // Validate the response structure
    if (typeof result.answered !== 'boolean' || 
        typeof result.confidence !== 'number' ||
        typeof result.explanation !== 'string') {
      throw new Error('Invalid response structure from OpenAI')
    }

    console.log('🔍 ANSWER DETECTION RESULT:', {
      question: diagnosticQuestion.question,
      userMessage,
      result
    })

    res.status(200).json(result)

  } catch (error) {
    console.error('Answer detection failed:', error)
    res.status(500).json({ 
      error: 'Answer detection failed',
      answered: false,
      answerIndex: null,
      confidence: 0,
      explanation: 'Error analyzing response'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}