import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import { getValidJWTToken } from '../../lib/jwt-manager'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { sessionId } = req.body

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' })
  }

  try {

    // Get JWT token using the same method as session creation
    const jwt = await getValidJWTToken()

    console.log('🔍 GETTING NEXT UNANSWERED QUESTION for session:', sessionId)

    // Get next diagnostic question from Merlin API
    const merlinEndpoint = 'https://merlin-394631772515.us-central1.run.app'
    const response = await axios.put(
      `${merlinEndpoint}/api/v1/dx-session/get-diagnostic-question`,
      { 
        persistanceSession: sessionId
      },
      {
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (response.data && response.data.question && response.data.question !== "No Questions Left") {
      console.log('🔍 NEXT UNANSWERED QUESTION RESPONSE:', {
        question: response.data.question,
        answerList: response.data.answer_list,
        sessionId: response.data.persistanceSession
      })

      res.status(200).json({
        question: response.data.question,
        answerList: response.data.answer_list,
        sessionId: response.data.persistanceSession
      })
    } else {
      console.log('🔍 NO MORE UNANSWERED QUESTIONS AVAILABLE - API returned "No Questions Left" or null')
      res.status(200).json({
        question: null,
        answerList: null,
        sessionId: sessionId
      })
    }

  } catch (error) {
    console.error('🚨 DIAGNOSTIC QUESTION API ERROR:', error)
    
    // Enhanced error logging to understand what's happening
    if (axios.isAxiosError(error)) {
      console.log('🔍 DETAILED ERROR ANALYSIS:')
      console.log('Status:', error.response?.status)
      console.log('Status Text:', error.response?.statusText)
      console.log('Response Data:', error.response?.data)
      console.log('Request URL:', error.config?.url)
      console.log('Request Method:', error.config?.method)
      console.log('Request Headers:', error.config?.headers)
      console.log('Request Payload:', error.config?.data)
      
      // 500 Internal Error indicates a real API problem - NOT "no more questions"
      if (error.response?.status === 500) {
        console.error('🚨 500 INTERNAL SERVER ERROR - This indicates a problem with our API call or the Merlin API backend')
        console.error('🚨 This is NOT normal and should be investigated')
        
        res.status(500).json({ 
          error: 'Merlin API Internal Server Error - indicates API call problem',
          details: error.response?.data,
          question: null,
          answerList: null,
          sessionId: sessionId
        })
        return
      }
      
      // Check if it's a 404 (no more questions available)
      if (error.response?.status === 404) {
        console.log('✅ NO MORE QUESTIONS - 404 response (legitimate end of questions)')
        res.status(200).json({
          question: null,
          answerList: null,
          sessionId: sessionId,
          note: 'No more questions available'
        })
        return
      }
    }
    
    res.status(500).json({ 
        error: 'Failed to get next diagnostic question',
        details: error instanceof Error ? error.message : 'Unknown error',
        question: null,
        answerList: null,
        sessionId: sessionId
      })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}