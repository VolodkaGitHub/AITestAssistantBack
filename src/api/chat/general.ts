import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

/**
 * @openapi
 * /api/general-chat:
 *   post:
 *     summary: General medical assistant chat endpoint
 *     description: |
 *       Receives a user message and optional conversation history.
 *       Responds with a helpful medical assistant reply from the Global Library of Medicine™.
 *       Reminds users to consult healthcare providers for medical advice.
 *     tags:
 *       - Chat
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: User's current message to the medical assistant
 *                 example: "What are the symptoms of diabetes?"
 *               conversationHistory:
 *                 type: array
 *                 description: Optional array of previous chat messages
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       example: "user"
 *                     content:
 *                       type: string
 *                       example: "I have been feeling very thirsty lately."
 *     responses:
 *       200:
 *         description: Successful response from the medical assistant
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 response:
 *                   type: string
 *                   description: Assistant's generated reply
 *                   example: "Common symptoms of diabetes include increased thirst and frequent urination."
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-07-19T14:10:00Z"
 *       400:
 *         description: Bad request - missing or invalid message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Valid message required"
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
 *                   example: "Failed to generate response"
 *                 details:
 *                   type: string
 *                   example: "Error message details"
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { message, conversationHistory = [] } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Valid message required' })
    }

    // Filter out any null/empty content from conversation history
    const cleanHistory = conversationHistory
      .filter((msg: any) => msg && msg.content && typeof msg.content === 'string' && msg.content.trim().length > 0)
      .map((msg: any) => ({
        role: msg.role || 'user',
        content: msg.content.trim()
      }))

    // Create messages array with clean history
    const messages = [
      {
        role: 'system',
        content: `You are a helpful medical assistant from the Global Library of Medicine™. Provide educational information while always reminding users to consult healthcare providers for medical advice. Keep responses clear and informative.`
      },
      ...cleanHistory,
      {
        role: 'user',
        content: message.trim()
      }
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages as any[],
      max_tokens: 1000,
      temperature: 0.7
    })

    const response = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

    return res.status(200).json({
      success: true,
      response,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('General chat API error:', error)
    return res.status(500).json({
      error: 'Failed to generate response',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}