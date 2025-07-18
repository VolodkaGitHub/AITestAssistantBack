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