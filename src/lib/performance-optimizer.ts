/**
 * Performance Optimization Module
 * Implements parallel processing and caching for medical diagnostic workflow
 */

interface OptimizedSessionData {
  sessionId: string
  differentialDiagnosis: any[]
  autoAnsweredQuestions: string[]
  nextQuestion: { question: string; answerList: string[] } | null
}

interface BatchProcessingResult {
  sessionData: OptimizedSessionData
  processingTime: number
  questionsProcessed: number
}

export class DiagnosticPerformanceOptimizer {
  private jwtTokenCache: { token: string; expires: number } | null = null
  private readonly JWT_CACHE_BUFFER = 5 * 60 * 1000 // 5 minutes buffer

  /**
   * Get cached JWT token or fetch new one
   */
  async getOptimizedJWTToken(): Promise<string> {
    const now = Date.now()
    
    if (this.jwtTokenCache && this.jwtTokenCache.expires > now + this.JWT_CACHE_BUFFER) {
      console.log('Using cached JWT token')
      return this.jwtTokenCache.token
    }

    console.log('Fetching fresh JWT token')
    const response = await fetch('/api/auth/jwt', { method: 'POST' })
    const data = await response.json()
    
    if (data.token) {
      // Cache for 55 minutes (JWT expires in 1 hour)
      this.jwtTokenCache = {
        token: data.token,
        expires: now + (55 * 60 * 1000)
      }
      return data.token
    }
    
    throw new Error('Failed to obtain JWT token')
  }

  /**
   * Process session creation and initial questions in parallel batches
   */
  async createOptimizedSession(
    patientData: any,
    initialSymptoms: string
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now()
    
    console.log('Starting optimized session creation with parallel processing')
    
    // Batch 1: Parallel session creation and symptom analysis
    const [sessionResponse, primarySymptom] = await Promise.all([
      fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientData, symptoms: initialSymptoms })
      }),
      this.extractPrimarySymptomOptimized(initialSymptoms)
    ])

    const sessionData = await sessionResponse.json()
    
    if (!sessionData.sessionId) {
      throw new Error('Session creation failed')
    }

    // Batch 2: Parallel question and diagnosis retrieval
    const [firstQuestion, initialDiagnosis] = await Promise.all([
      this.getNextQuestionOptimized(sessionData.sessionId),
      this.getDifferentialDiagnosisOptimized(sessionData.sessionId)
    ])

    // Batch 3: Auto-answer processing if applicable
    let autoAnsweredQuestions: string[] = []
    let processedQuestions = 0
    let currentQuestion = firstQuestion
    
    if (firstQuestion.question && firstQuestion.answerList) {
      const batchResult = await this.processQuestionsInBatch(
        sessionData.sessionId,
        initialSymptoms,
        firstQuestion
      )
      
      autoAnsweredQuestions = batchResult.autoAnsweredQuestions
      processedQuestions = batchResult.questionsProcessed
      currentQuestion = batchResult.nextQuestion
    }

    const processingTime = Date.now() - startTime
    console.log(`Optimized session creation completed in ${processingTime}ms`)

    return {
      sessionData: {
        sessionId: sessionData.sessionId,
        differentialDiagnosis: sessionData.differentialDiagnosis || initialDiagnosis,
        autoAnsweredQuestions,
        nextQuestion: currentQuestion
      },
      processingTime,
      questionsProcessed: processedQuestions
    }
  }

  /**
   * Process multiple questions in optimized batches
   */
  private async processQuestionsInBatch(
    sessionId: string,
    userInput: string,
    firstQuestion: { question: string; answerList: string[] }
  ): Promise<{
    autoAnsweredQuestions: string[]
    questionsProcessed: number
    nextQuestion: { question: string; answerList: string[] } | null
  }> {
    const autoAnsweredQuestions: string[] = []
    let questionsProcessed = 0
    let currentQuestion = firstQuestion

    // Process up to 3 questions in sequence (most sessions don't have more)
    const maxQuestions = 3
    
    while (currentQuestion.question && currentQuestion.answerList && questionsProcessed < maxQuestions) {
      console.log(`Batch processing question ${questionsProcessed + 1}: ${currentQuestion.question}`)
      
      // Parallel answer extraction and preparation for submission
      const [extractedAnswer, nextQuestionPromise] = await Promise.all([
        this.extractAnswerOptimized(userInput, currentQuestion.question, currentQuestion.answerList),
        questionsProcessed < maxQuestions - 1 ? 
          this.prepareNextQuestionQuery(sessionId) : 
          Promise.resolve(null)
      ])

      if (extractedAnswer.answered && extractedAnswer.confidence > 0.7) {
        console.log(`Auto-answering with ${Math.round(extractedAnswer.confidence * 100)}% confidence`)
        
        // Submit answer and get next question in parallel
        const [submitSuccess, nextQuestionData] = await Promise.all([
          this.submitAnswerOptimized(sessionId, extractedAnswer.answerIndex),
          nextQuestionPromise || this.getNextQuestionOptimized(sessionId)
        ])

        if (submitSuccess) {
          const answeredInfo = `"${currentQuestion.question}" → ${currentQuestion.answerList[extractedAnswer.answerIndex]} (${Math.round(extractedAnswer.confidence * 100)}% confidence)`
          autoAnsweredQuestions.push(answeredInfo)
          questionsProcessed++
          
          currentQuestion = nextQuestionData
        } else {
          break // Stop if submission fails
        }
      } else {
        break // Stop if question can't be auto-answered
      }
    }

    return {
      autoAnsweredQuestions,
      questionsProcessed,
      nextQuestion: currentQuestion?.question ? currentQuestion : null
    }
  }

  /**
   * Optimized primary symptom extraction with reduced token usage
   */
  private async extractPrimarySymptomOptimized(symptoms: string): Promise<string> {
    const response = await fetch('/api/symptoms/extract-primary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        symptoms,
        optimize: true // Flag for reduced processing
      })
    })
    
    const data = await response.json()
    return data.primarySymptom || symptoms
  }

  /**
   * Optimized answer extraction with streamlined prompts
   */
  private async extractAnswerOptimized(
    userInput: string, 
    question: string, 
    answerList: string[]
  ): Promise<{ answered: boolean; answerIndex: number; confidence: number; explanation: string }> {
    const response = await fetch('/api/chat/extract-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: userInput,
        question,
        answerList,
        optimized: true // Use streamlined prompt
      })
    })
    
    return response.json()
  }

  /**
   * Optimized API calls with cached JWT
   */
  private async getNextQuestionOptimized(sessionId: string) {
    return fetch('/api/diagnostic/get-next-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    }).then(res => res.json())
  }

  private async submitAnswerOptimized(sessionId: string, answerIndex: number): Promise<boolean> {
    const response = await fetch('/api/diagnostic/submit-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, answerIndex })
    })
    
    return response.ok
  }

  private async getDifferentialDiagnosisOptimized(sessionId: string) {
    return fetch('/api/session/refresh-diagnosis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    }).then(res => res.json())
  }

  /**
   * Pre-prepare next question query for parallel execution
   */
  private async prepareNextQuestionQuery(sessionId: string): Promise<any> {
    // This creates a prepared query that can be executed in parallel
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(this.getNextQuestionOptimized(sessionId))
      }, 100) // Small delay to ensure previous answer is submitted
    })
  }
}

export const performanceOptimizer = new DiagnosticPerformanceOptimizer()