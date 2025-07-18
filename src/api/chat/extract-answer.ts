import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userMessage, question, answerList } = req.body

    if (!userMessage || !question || !answerList) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    // Use OpenAI to extract answer from user message
    const systemPrompt = `You are an expert medical assistant analyzing patient responses to extract answers to specific diagnostic questions.

TASK: Determine if the user's message contains an answer to the given diagnostic question.

DIAGNOSTIC QUESTION: "${question}"
AVAILABLE ANSWERS: ${answerList.join(', ')}

ANALYSIS RULES:
1. Look for explicit mentions of the symptom/condition in the question
2. Look for implicit answers through context clues
3. Consider synonyms and related medical terms
4. If the user mentions having the symptom, map to "Present"
5. If the user denies having the symptom, map to "Absent"
6. If unclear or no answer is found, return null

RESPONSE FORMAT:
Respond with a JSON object containing:
{
  "answered": boolean,
  "answerIndex": number|null,
  "confidence": number (0.0-1.0),
  "explanation": "brief explanation of reasoning"
}

EXAMPLES:
Question: "Have you had a sore throat?"
User: "My throat is really sore" → {"answered": true, "answerIndex": 1, "confidence": 0.95, "explanation": "User explicitly mentions having a sore throat"}
User: "No throat problems" → {"answered": true, "answerIndex": 0, "confidence": 0.9, "explanation": "User denies throat problems"}
User: "I have a headache" → {"answered": false, "answerIndex": null, "confidence": 0.0, "explanation": "No mention of throat symptoms"}

Analyze the user message and provide your assessment.`

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `USER MESSAGE: "${userMessage}"` }
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.1
    })

    const analysis = JSON.parse(response.choices[0]?.message?.content || '{}')

    // Validate the response structure
    if (typeof analysis.answered !== 'boolean') {
      throw new Error('Invalid response format from OpenAI')
    }

    res.status(200).json({
      answered: analysis.answered,
      answerIndex: analysis.answerIndex,
      confidence: analysis.confidence || 0,
      explanation: analysis.explanation || ''
    })

  } catch (error) {
    console.error('Extract answer failed:', error)
    res.status(500).json({
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