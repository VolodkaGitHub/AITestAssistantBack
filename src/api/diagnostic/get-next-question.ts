import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { getValidJWTToken } from '../../lib/jwt-manager'

interface GetNextQuestionRequest {
  persistanceSession: string
}

interface DiagnosticQuestionResponse {
  question: string
  answer_list: string[]
  persistanceSession: string
}

/**
 * @openapi
 * /api/diagnostic/get-next-question:
 *   put:
 *     summary: Get next diagnostic question
 *     description: Returns the next diagnostic question based on the current session.
 *     tags:
 *       - Diagnostic
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - persistanceSession
 *             properties:
 *               persistanceSession:
 *                 type: string
 *                 description: Diagnostic session identifier
 *                 example: "session_123456789"
 *     responses:
 *       200:
 *         description: Next question retrieved or session completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 question:
 *                   type: string
 *                   example: "Do you have a fever?"
 *                 answerOptions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Yes", "No", "Not sure"]
 *                 persistanceSession:
 *                   type: string
 *                   example: "session_123456789"
 *                 endpoint:
 *                   type: string
 *                   example: "PUT /api/v1/dx-session/get-next-question"
 *                 noMoreQuestions:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "All diagnostic questions have been answered"
 *       400:
 *         description: Missing or invalid session ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "persistanceSession is required"
 *       401:
 *         description: JWT authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to get JWT token"
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed - PUT required"
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
 *                 details:
 *                   type: string
 *                   example: "fetch failed"
 */


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed - PUT required' })
  }

  try {
    const { persistanceSession }: GetNextQuestionRequest = req.body

    if (!persistanceSession) {
      return res.status(400).json({ error: 'persistanceSession is required' })
    }

    console.log('🔍 GETTING NEXT QUESTION via PUT for session:', persistanceSession)

    // Get valid JWT token
    const jwtToken = await getValidJWTToken()
    if (!jwtToken) {
      return res.status(401).json({ error: 'Failed to get JWT token' })
    }

    // Make PUT request to the new endpoint
    const merlinEndpoint = process.env.MERLIN_ENDPOINT || 'https://merlin-394631772515.us-central1.run.app'
    const response = await fetch(`${merlinEndpoint}/api/v1/dx-session/get-diagnostic-question`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        persistanceSession
      })
    })

    console.log('🔍 PUT NEXT QUESTION RESPONSE STATUS:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log('🔍 PUT Next question error:', response.status, errorText)
      
      if (response.status === 500 && errorText.includes('Internal Error')) {
        return res.status(200).json({ 
          error: 'No more questions available',
          message: 'All diagnostic questions have been answered',
          noMoreQuestions: true
        })
      }
      
      return res.status(response.status).json({ 
        error: `API error: ${response.status}`,
        details: errorText
      })
    }

    const questionData: DiagnosticQuestionResponse = await response.json()
    console.log('🔍 PUT NEXT QUESTION DATA:', questionData)

    res.status(200).json({
      success: true,
      question: questionData.question,
      answerOptions: questionData.answer_list,
      persistanceSession: questionData.persistanceSession,
      endpoint: 'PUT /api/v1/dx-session/get-next-question'
    })

  } catch (error) {
    console.error('🔍 PUT Get next question error:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}