import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import multer from 'multer'
import { OpenAI } from 'openai'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import { promisify } from 'util'

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, PDFs, and Word documents
    const allowedTypes = [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Unsupported file type') as any, false)
    }
  }
})

const uploadMiddleware = promisify(upload.single('file'))

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Handle file upload
    await uploadMiddleware(req as any, res as any)
    const file = (req as any).file

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    let analysisResult = ''

    // Process based on file type
    if (file.mimetype.startsWith('image/')) {
      // Handle image analysis
      const base64Image = file.buffer.toString('base64')
      const imageDataUrl = `data:${file.mimetype};base64,${base64Image}`
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this medical image in detail. Describe any visible symptoms, conditions, or medical findings. Provide observations that could be helpful for medical assessment. If this appears to be a medical document or test result, extract and explain the key information."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      })

      analysisResult = response.choices[0]?.message?.content || 'Unable to analyze image'

    } else if (file.mimetype === 'application/pdf') {
      // Handle PDF documents
      try {
        const pdfData = await pdfParse(file.buffer)
        const extractedText = pdfData.text.slice(0, 4000) // Limit text length
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a medical document analyzer. Extract and summarize key medical information from documents including test results, medical reports, prescriptions, or health records. Focus on clinically relevant findings."
            },
            {
              role: "user", 
              content: `Analyze this medical document and extract key information:\n\n${extractedText}`
            }
          ],
          max_tokens: 1000
        })

        analysisResult = response.choices[0]?.message?.content || 'Unable to analyze PDF'
      } catch (error) {
        analysisResult = 'Error processing PDF document'
      }

    } else if (file.mimetype.includes('word')) {
      // Handle Word documents
      try {
        const result = await mammoth.extractRawText({ buffer: file.buffer })
        const extractedText = result.value.slice(0, 4000) // Limit text length
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o", 
          messages: [
            {
              role: "system",
              content: "You are a medical document analyzer. Extract and summarize key medical information from documents including test results, medical reports, prescriptions, or health records. Focus on clinically relevant findings."
            },
            {
              role: "user",
              content: `Analyze this medical document and extract key information:\n\n${extractedText}`
            }
          ],
          max_tokens: 1000
        })

        analysisResult = response.choices[0]?.message?.content || 'Unable to analyze document'
      } catch (error) {
        analysisResult = 'Error processing Word document'
      }
    }

    return res.status(200).json({
      success: true,
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      analysis: analysisResult
    })

  } catch (error) {
    console.error('File upload error:', error)
    return res.status(500).json({ 
      error: 'Failed to process file',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export const config = {
  api: {
    bodyParser: false, // Disable body parsing for multer
  },
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}