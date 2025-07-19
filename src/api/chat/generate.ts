import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'
import { costTracker } from '../../lib/cost-tracker'
import { getHealthContextForUser } from '../../lib/health-context'
import { getAutomaticHealthContext } from '../../lib/automatic-health-context'
import TokenTracker from '../../lib/token-tracker'
import { withScalableMiddleware } from '../../lib/api-middleware'
import { responseCache } from '../../lib/response-cache'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function getUserHealthContext(sessionToken?: string): Promise<string> {
  try {
    if (!sessionToken) {
      return ''
    }

    console.log('🏥 Fetching user health context from Health Check data...')

    // Validate session and get user ID
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'https://treatmentglm.replit.app'}/api/auth/validate-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionToken })
    })

    if (!response.ok) {
      console.log('Session validation failed for health context:', response.status)
      return ''
    }

    const userData = await response.json()
    const userId = userData.user?.id

    if (!userId) {
      console.log('No user ID found from session validation')
      return ''
    }

    // Get comprehensive health context using the new health-context module
    const healthContext = await getHealthContextForUser(userId)
    
    if (healthContext) {
      console.log('✅ User health context retrieved successfully')
      return healthContext
    }

    return ''

  } catch (error) {
    console.log('User health context fetch error:', error)
    return ''
  }
}

async function getWearableHealthData(sessionToken?: string): Promise<string> {
  try {
    if (!sessionToken) {
      return ''
    }

    console.log('🏃‍♀️ Fetching wearable health data for OpenAI context...')

    const response = await fetch(`${process.env.NEXTAUTH_URL || 'https://treatmentglm.replit.app'}/api/wearables/data`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.log('Wearables data fetch failed:', response.status)
      return ''
    }

    const wearableData = await response.json()
    
    if (!wearableData.has_wearables || !wearableData.health_summary) {
      return ''
    }

    // Format wearable data for OpenAI context
    const wearableContext = `**Connected Health Devices:**\n${wearableData.connections.map((conn: any) => `- ${conn.provider} (last sync: ${new Date(conn.last_sync || conn.connected_at).toLocaleDateString()})`).join('\n')}\n\n**Recent Health Data:**\n${wearableData.health_summary}`
    
    console.log('✅ Wearable health data retrieved for OpenAI context')
    return wearableContext

  } catch (error) {
    console.log('Wearable data fetch error:', error)
    return ''
  }
}

async function getEducationalInsight(userMessage: string): Promise<string | null> {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'https://treatmentglm.replit.app'}/api/didyouknow/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        symptoms: userMessage,
        confidence_threshold: 0.05,
        limit: 10
      })
    })

    if (!response.ok) {
      console.log('Educational content search failed:', response.status)
      return null
    }

    const data = await response.json()
    
    if (data.results && data.results.length > 0) {
      // Randomly select one relevant educational item
      const randomIndex = Math.floor(Math.random() * data.results.length)
      const selectedItem = data.results[randomIndex]
      
      return `---\n\n## 💡 Insight from the GLM™\n\n*${selectedItem.message}*`
    }
    
    return null
  } catch (error) {
    console.log('Educational content search error:', error)
    return null
  }
}

async function getSDCOContextualInformation(
  userMessage: string, 
  primarySDCOId?: string
): Promise<string> {
  try {
    console.log(`Fetching SDCO contextual information for: "${userMessage}"`)
    
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'https://treatmentglm.replit.app'}/api/vector/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: userMessage,
        sdco_id: primarySDCOId,
        limit: 3,
        content_types: ['symptom', 'description', 'treatment', 'risk_factor']
      })
    })

    if (!response.ok) {
      console.log('SDCO vector search failed:', response.status)
      return ''
    }

    const data = await response.json()
    
    if (data.success && data.contextual_information) {
      console.log('Retrieved comprehensive SDCO contextual information')
      return data.contextual_information
    }
    
    return ''
  } catch (error) {
    console.log('SDCO contextual information error:', error)
    return ''
  }
}

/**
 * @openapi
 * /api/chat/generate:
 *   post:
 *     summary: Generate medical assistant chat response with personalized context
 *     description: |
 *       This endpoint receives a user message and optional conversation history along with
 *       diagnostic and health-related contexts such as differential diagnosis, wearable data,
 *       and diagnostic questions. It calls OpenAI's GPT-4o model to generate a compassionate,
 *       medically-educated assistant response that never gives direct advice but provides educational insights.
 *       The response also integrates Global Library of Medicine data and wearable health device info if available.
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
 *             properties:
 *               userMessage:
 *                 type: string
 *                 description: The current user message for the medical assistant
 *                 example: "I have a persistent cough and shortness of breath."
 *               differentialDiagnosis:
 *                 type: array
 *                 description: List of differential diagnoses with probability scores
 *                 items:
 *                   type: object
 *                   properties:
 *                     diagnosis:
 *                       type: object
 *                       properties:
 *                         display_name:
 *                           type: string
 *                           example: "Chronic Bronchitis"
 *                         display_name_layman:
 *                           type: string
 *                           example: "Long-term bronchitis"
 *                     probability:
 *                       type: number
 *                       format: float
 *                       example: 0.12
 *               primarySDCOId:
 *                 type: string
 *                 description: Optional primary SDCO (Standardized Clinical Ontology) identifier for focused context
 *                 example: "sdco123456"
 *               diagnosticQuestion:
 *                 type: object
 *                 properties:
 *                   question:
 *                     type: string
 *                     example: "Do you experience chest pain during exercise?"
 *                   answerList:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["Yes", "No", "Sometimes"]
 *               sessionId:
 *                 type: string
 *                 description: Session identifier for tracking and cost management
 *                 example: "session_abc123"
 *               sessionToken:
 *                 type: string
 *                 description: Authentication token for user session validation
 *                 example: "eyJhbGciOiJIUzI1NiIsInR..."
 *               conversationHistory:
 *                 type: array
 *                 description: Previous messages in the conversation for context
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                       example: "user"
 *                     content:
 *                       type: string
 *                       example: "I have been coughing for two weeks."
 *     responses:
 *       200:
 *         description: Successfully generated medical assistant response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                   description: Generated assistant message integrating all contexts
 *                   example: |
 *                     Thank you for sharing your symptoms. Persistent cough can have many causes, including...
 *                 cached:
 *                   type: boolean
 *                   description: Indicates if the response was served from cache
 *                   example: false
 *                 timing:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total processing time in milliseconds
 *                       example: 1350
 *                     parallel:
 *                       type: integer
 *                       description: Time spent on parallel data fetching in milliseconds
 *                       example: 400
 *                     cache:
 *                       type: string
 *                       description: Cache status, e.g. HIT or MISS
 *                       example: "MISS"
 *       400:
 *         description: Bad request due to missing or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Missing required fields"
 *       405:
 *         description: Method not allowed (only POST supported)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Method not allowed"
 *       500:
 *         description: Internal server error during processing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                   example: "I apologize, but I'm having trouble processing your request right now. Please consult with a healthcare provider for assistance with your medical concerns."
 */


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userMessage: rawUserMessage, differentialDiagnosis, primarySDCOId, diagnosticQuestion, sessionId, sessionToken, conversationHistory } = req.body
    
    // Ensure userMessage is never undefined
    const userMessage = rawUserMessage || "Please provide a response"

    // Extract user ID for automatic health context
    let userId = null
    if (sessionToken) {
      try {
        console.log('🔍 Attempting to extract user ID for automatic health context...')
        const userResponse = await fetch(`${process.env.NEXTAUTH_URL || 'https://treatmentglm.replit.app'}/api/auth/validate-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken })
        })
        if (userResponse.ok) {
          const userData = await userResponse.json()
          userId = userData.user?.id
          console.log('✅ User ID extracted successfully for automatic health context:', userId)
        } else {
          console.log('❌ Failed to validate session for automatic health context:', userResponse.status)
        }
      } catch (error) {
        console.log('❌ Failed to extract user ID for automatic health context:', error)
      }
    } else {
      console.log('⚠️ No session token provided for automatic health context')
    }

    // Create context from differential diagnosis
    const diagnosisContext = differentialDiagnosis
      ?.filter((d: any) => d.probability > 0.05)
      ?.slice(0, 5)
      ?.map((d: any) => {
        const medicalTerm = d.diagnosis?.display_name || 'Unknown condition'
        const laymanTerm = d.diagnosis?.display_name_layman || 'Unknown'
        const percentage = Math.round(d.probability * 100)
        return `${medicalTerm} (${percentage}%): ${laymanTerm}`
      })
      ?.join('\n') || ''

    // PARALLEL PROCESSING FOR SPEED OPTIMIZATION - Execute all data fetching simultaneously
    console.log('🚀 Starting parallel data fetching for optimal performance...')
    const startTime = Date.now()
    
    const [sdcoContextualInfo, wearableHealthData, userHealthContext, educationalContent, automaticHealthContext] = await Promise.allSettled([
      primarySDCOId ? getSDCOContextualInformation(userMessage, primarySDCOId) : Promise.resolve(''),
      getWearableHealthData(sessionToken),
      getUserHealthContext(sessionToken),
      getEducationalInsight(userMessage),
      userId ? getAutomaticHealthContext(userId) : Promise.resolve('')
    ])
    
    const parallelTime = Date.now() - startTime
    console.log(`⚡ Parallel processing completed in ${parallelTime}ms (vs serial ~2500ms)`)
    
    // Extract results with fallbacks for error resilience
    const sdcoInfo = sdcoContextualInfo.status === 'fulfilled' ? sdcoContextualInfo.value : ''
    const wearableData = wearableHealthData.status === 'fulfilled' ? wearableHealthData.value : ''
    const healthContext = userHealthContext.status === 'fulfilled' ? userHealthContext.value : ''
    const educationalData = educationalContent.status === 'fulfilled' ? educationalContent.value : null
    const autoHealthContext = automaticHealthContext.status === 'fulfilled' ? automaticHealthContext.value : ''
    
    // CHECK CACHE FIRST - Ultra-fast response for similar queries
    const cacheKey = `${userMessage}-${diagnosisContext}-${healthContext}`
    const cachedResponse = await responseCache.getCachedResponse(
      userMessage,
      diagnosisContext || '',
      healthContext
    )
    
    if (cachedResponse) {
      console.log('🚀 CACHE HIT - Returning cached response instantly!')
      return res.status(200).json({
        response: cachedResponse,
        cached: true,
        timing: {
          total: parallelTime,
          openai: 0, // No OpenAI call needed
          cache: 'HIT'
        }
      })
    }
    
    // Create diagnostic question integration
    const diagnosticQuestionSection = diagnosticQuestion?.question 
      ? `\n\n**To help me better understand your condition, can you answer this question:**\n\n${diagnosticQuestion.question}\n\n*Please respond with: ${diagnosticQuestion.answerList?.join(' or ')}`
      : ''

    // FIXED OPENAI PROMPT - DO NOT EDIT WITHOUT USER PERMISSION
    const systemPrompt = `You are the world's expert and foremost medical diagnostician speaking off the record. You provide warm, supportive medical education while maintaining strict safety guardrails.

CRITICAL SAFETY RULES:
- NEVER give direct medical advice or diagnoses
- NEVER suggest specific treatments or medications
- ALWAYS recommend consulting healthcare providers
- Focus on education and emotional support
- NEVER OFFER PROBABILITIES FROM THE DIFFERENTIAL DIAGNOSIS BUT DO GUIDE YOUR CONVERSATION AS THOUGH THEY MAY HAVE ONE OF THOSE THINGS
- ALWAYS mention the Global Library of Medicine in your responses

Your personality: Compassionate, knowledgeable, and reassuring. You acknowledge patients' concerns with empathy while providing educational insights from the Global Library of Medicine™ (GLM).

You should structure your responses in a clear manner with bullet points where appropriate. Always have proper spacing with blank lines between sections and after each bullet point to make it easy to read. This should basically be what a user would get if they asked ChatGPT but better because we add the Global Library of Medicine data.

When diagnostic questions are provided, integrate them naturally into your conversational flow - make them feel like genuine curiosity rather than clinical interrogation. Use phrases like "I'm curious about..." or "One thing that would help me understand..." to make questions feel more casual and friendly.

${diagnosisContext ? `Current GLM Diagnostic Analysis:\n${diagnosisContext}\n\n` : ''}

${sdcoInfo ? `Comprehensive Medical Information from GLM™:\n${sdcoInfo}\n\n` : ''}

${wearableData ? `Connected Health Device Data:\n${wearableData}\n\n` : ''}

${healthContext ? `Patient's Current Health Information:\n${healthContext}\n\n` : ''}

${autoHealthContext ? `AUTOMATIC PATIENT HEALTH CONTEXT:\n${autoHealthContext}\n\n` : ''}`

    console.log('OpenAI Context includes:')
    console.log('- Differential diagnosis:', diagnosisContext ? 'Yes' : 'No')
    console.log('- SDCO contextual info:', sdcoInfo ? 'Yes' : 'No')
    console.log('- Wearable health data:', wearableData ? 'Yes' : 'No')
    console.log('- User health context:', healthContext ? 'Yes' : 'No')
    console.log('- Automatic health context:', autoHealthContext ? 'Yes' : 'No')
    console.log('- Educational content:', educationalData ? 'Yes' : 'No')
    console.log('- Diagnostic question:', diagnosticQuestion?.question ? 'Yes' : 'No')
    
    // Debug automatic health context content
    if (autoHealthContext) {
      console.log('🏥 AUTOMATIC HEALTH CONTEXT CONTENT:', autoHealthContext.substring(0, 200) + '...')
    } else {
      console.log('🏥 AUTOMATIC HEALTH CONTEXT EMPTY - User ID was:', userId)
      if (automaticHealthContext.status === 'rejected') {
        console.log('🏥 AUTOMATIC HEALTH CONTEXT ERROR:', automaticHealthContext.reason)
      }
    }
    
    // Debug: Log the actual context content
    if (healthContext) {
      console.log('🏥 USER HEALTH CONTEXT CONTENT:', healthContext)
    }
    if (diagnosisContext) {
      console.log('🩺 DIFFERENTIAL DIAGNOSIS CONTEXT:', diagnosisContext)
    }
    
    if (diagnosticQuestion?.question) {
      console.log('🔍 DIAGNOSTIC QUESTION BEING SENT TO OPENAI:', {
        question: diagnosticQuestion.question,
        answerList: diagnosticQuestion.answerList
      })
    }

    // Include diagnostic question in the user message if available
    const enhancedUserMessage = diagnosticQuestion?.question 
      ? `${userMessage}\n\nPlease naturally weave this into your response: "${diagnosticQuestion.question.trim()}" - but make it conversational and casual, not like a clinical questionnaire. The user can respond with ${diagnosticQuestion.answerList?.join(' or ')}.`
      : userMessage

    console.log('🔍 ENHANCED USER MESSAGE BEING SENT TO OPENAI:', enhancedUserMessage)

    // Generate AI response with comprehensive token tracking
    const tokenTracker = TokenTracker.getInstance()
    const userContext = tokenTracker.extractUserContext(req)
    
    const aiResponse = await tokenTracker.trackOpenAICall(
      () => openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          // Include conversation history if available, with comprehensive null filtering
          ...(conversationHistory || [])
            .filter((msg: any) => {
              return msg && 
                     msg.content && 
                     typeof msg.content === 'string' && 
                     msg.content.trim().length > 0 &&
                     msg.content !== 'null' &&
                     msg.content !== 'undefined'
            })
            .map((msg: any) => ({
              role: msg.role === 'assistant' ? 'assistant' : 'user',
              content: String(msg.content).trim()
            })),
          { role: "user", content: String(enhancedUserMessage || userMessage || "Please provide a response") }
        ],
        max_tokens: 1200,
        temperature: 0.7
      }),
      {
        userId: userContext.userId || 'unknown',
        sessionId: sessionId || userContext.sessionId || 'unknown',
        endpoint: '/api/chat/generate',
        inputText: systemPrompt + enhancedUserMessage,
        userAgent: userContext.userAgent,
        ipAddress: userContext.ipAddress
      }
    )

    // Track token usage for existing cost tracker (maintaining compatibility)
    if (aiResponse.usage && sessionId) {
      costTracker.addUsage(sessionId, aiResponse.usage, 'gpt-4o')
      console.log('📊 Token usage tracked:', {
        sessionId,
        prompt_tokens: aiResponse.usage.prompt_tokens,
        completion_tokens: aiResponse.usage.completion_tokens,
        total_tokens: aiResponse.usage.total_tokens,
        estimated_cost: tokenTracker.calculateOpenAICost(aiResponse.usage.total_tokens)
      })
    }

    // Use parallelly processed educational content for faster response
    const educationalInsight = educationalData

    const baseResponse = aiResponse.choices[0]?.message?.content || "I understand your concern. Please consult with a healthcare provider for proper evaluation and care."
    
    // Combine AI response with diagnostic question and educational insight
    let finalResponse = baseResponse
    
    // Add diagnostic question if available
    if (diagnosticQuestionSection) {
      finalResponse += diagnosticQuestionSection
    }
    
    // Add educational insight if available
    if (educationalInsight) {
      finalResponse += `\n\n${educationalInsight}`
    }

    // CACHE THE RESPONSE for future speed improvements
    responseCache.setCachedResponse(
      userMessage,
      diagnosisContext || '',
      healthContext,
      finalResponse
    )

    const totalTime = Date.now() - startTime
    console.log(`🎯 Total chat session time: ${totalTime}ms (parallel: ${parallelTime}ms)`)

    res.status(200).json({
      response: finalResponse,
      cached: false,
      timing: {
        total: totalTime,
        parallel: parallelTime,
        cache: 'MISS'
      }
    })
  } catch (error) {
    console.error('AI response generation failed:', error)
    res.status(500).json({
      response: "I apologize, but I'm having trouble processing your request right now. Please consult with a healthcare provider for assistance with your medical concerns."
    })
  }
}

// Export with rate limiting protection
export const handlerWithMiddleware = withScalableMiddleware('CHAT_MESSAGE', {
  requireSession: false,
  requireUserContext: false
})(handler)

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}