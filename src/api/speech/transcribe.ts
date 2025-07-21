import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import multer from 'multer'
import { OpenAI } from 'openai'

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
})

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * @openapi
 * /api/speech/transcribe:
 *   post:
 *     summary: Transcribe an audio file using OpenAI Whisper
 *     description: Upload an audio file (max 25MB) and receive a text transcription.
 *     tags:
 *       - Speech
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file to transcribe (max 25MB)
 *     responses:
 *       200:
 *         description: Transcription successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 text:
 *                   type: string
 *                   description: Transcribed text from the audio file
 *                   example: "Hello, how can I help you today?"
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: No audio file provided or invalid file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: No audio file provided
 *       405:
 *         description: Method not allowed (only POST)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error during transcription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to transcribe audio
 *                 details:
 *                   type: string
 *                   example: "Error message details here"
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Use multer middleware to handle file upload
    await new Promise<void>((resolve, reject) => {
      upload.single('audio')(req as any, res as any, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    const file = (req as any).file
    if (!file) {
      return res.status(400).json({ error: 'No audio file provided' })
    }

    // Convert buffer to File-like object for OpenAI
    const audioFile = new File([file.buffer], file.originalname || 'audio.wav', {
      type: file.mimetype || 'audio/wav'
    })

    // Transcribe using OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en', // English language
      response_format: 'text',
    })

    return res.status(200).json({ 
      text: transcription,
      success: true 
    })

  } catch (error) {
    console.error('Speech transcription error:', error)
    return res.status(500).json({ 
      error: 'Failed to transcribe audio',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for file uploads
  },
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}