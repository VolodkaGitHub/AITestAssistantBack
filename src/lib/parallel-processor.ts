/**
 * Parallel Processing Module for Clinical Diagnostic Workflow
 * Optimizes speed through concurrent API calls while preserving all functionality
 */

import { clinicalAssistantAPI } from './api'

interface ParallelSessionResult {
  sessionId: string
  differentialDiagnosis: any[]
  firstQuestion: { question: string; answerList: string[] } | null
  autoAnsweredQuestions: string[]
  processingTime: number
}

export class ParallelDiagnosticProcessor {
  /**
   * Process session creation with parallel API calls
   * Maintains all context while improving speed through concurrency
   */
  async createSessionWithParallelProcessing(
    patientData: any,
    symptoms: string
  ): Promise<ParallelSessionResult> {
    const startTime = Date.now()
    console.log('Starting parallel session creation')

    // Step 1: Create session (must be sequential)
    const sessionData = await clinicalAssistantAPI.createSession({
      patientData,
      initialSymptoms: symptoms
    })
    
    if (!sessionData.sessionId) {
      throw new Error('Session creation failed')
    }

    // Step 2: Parallel initialization of question and diagnosis
    const [firstQuestion, initialDiagnosis] = await Promise.all([
      clinicalAssistantAPI.getNextDiagnosticQuestion(sessionData.sessionId),
      clinicalAssistantAPI.refreshDifferentialDiagnosis(sessionData.sessionId)
    ])

    // Step 3: Process auto-answering with optimized batching
    let autoAnswerResult = {
      autoAnsweredQuestions: [] as string[],
      nextQuestion: null as { question: string; answerList: string[] } | null,
      finalDiagnosis: [] as any[]
    }

    if (firstQuestion && firstQuestion.question && firstQuestion.answerList) {
      autoAnswerResult = await this.processAutoAnswersInParallel(
        sessionData.sessionId,
        symptoms,
        firstQuestion as { question: string; answerList: string[] }
      )
    }

    const processingTime = Date.now() - startTime
    console.log(`Parallel session creation completed in ${processingTime}ms`)

    return {
      sessionId: sessionData.sessionId,
      differentialDiagnosis: autoAnswerResult.finalDiagnosis,
      firstQuestion: autoAnswerResult.nextQuestion,
      autoAnsweredQuestions: autoAnswerResult.autoAnsweredQuestions,
      processingTime
    }
  }

  /**
   * Type guard to validate diagnostic question
   */
  private isValidDiagnosticQuestion(question: any): question is { question: string; answerList: string[] } {
    return question && 
           typeof question.question === 'string' && 
           question.question !== null &&
           Array.isArray(question.answerList) && 
           question.answerList !== null
  }

  /**
   * Process auto-answers with parallel question checking
   * Maintains full diagnostic context while optimizing speed
   */
  private async processAutoAnswersInParallel(
    sessionId: string,
    userInput: string,
    firstQuestion: { question: string; answerList: string[] }
  ): Promise<{
    autoAnsweredQuestions: string[]
    nextQuestion: { question: string; answerList: string[] } | null
    finalDiagnosis: any[]
  }> {
    if (!firstQuestion.question || !firstQuestion.answerList) {
      return {
        autoAnsweredQuestions: [],
        nextQuestion: null,
        finalDiagnosis: []
      }
    }

    const autoAnsweredQuestions: string[] = []
    let currentQuestion = firstQuestion
    let questionsProcessed = 0
    const maxQuestions = 5 // Reasonable limit to prevent infinite loops

    while (currentQuestion.question && currentQuestion.answerList && questionsProcessed < maxQuestions) {
      console.log(`Processing question ${questionsProcessed + 1}: ${currentQuestion.question}`)

      // Parallel answer extraction and next question preparation
      const [extractedAnswer, nextQuestionPromise] = await Promise.all([
        clinicalAssistantAPI.extractAnswerFromMessage(
          userInput,
          currentQuestion.question,
          currentQuestion.answerList
        ),
        // Pre-fetch next question for potential use
        questionsProcessed < maxQuestions - 1 ? 
          this.delayedNextQuestion(sessionId, 500) : // Small delay to ensure current answer is processed
          Promise.resolve(null)
      ])

      // Check if answer is confident enough for auto-submission
      if (extractedAnswer.answered && extractedAnswer.answerIndex !== null && extractedAnswer.confidence > 0.7) {
        console.log(`Auto-answering with ${Math.round(extractedAnswer.confidence * 100)}% confidence`)

        // Parallel answer submission and diagnosis refresh
        const [submitSuccess, diagnosisRefresh] = await Promise.all([
          clinicalAssistantAPI.submitDiagnosticAnswer(sessionId, extractedAnswer.answerIndex),
          clinicalAssistantAPI.refreshDifferentialDiagnosis(sessionId)
        ])

        if (submitSuccess) {
          // Track auto-answered question with full context
          const answeredInfo = `"${currentQuestion.question}" → ${currentQuestion.answerList[extractedAnswer.answerIndex]} (${Math.round(extractedAnswer.confidence * 100)}% confidence)`
          autoAnsweredQuestions.push(answeredInfo)
          questionsProcessed++

          // Get next question (use pre-fetched if available)
          currentQuestion = await (nextQuestionPromise || 
            clinicalAssistantAPI.getNextDiagnosticQuestion(sessionId))
        } else {
          console.log('Answer submission failed, stopping auto-processing')
          break
        }
      } else {
        console.log(`Question not auto-answerable (confidence: ${extractedAnswer.confidence})`)
        break
      }
    }

    // Get final diagnosis state
    const finalDiagnosis = await clinicalAssistantAPI.refreshDifferentialDiagnosis(sessionId)

    return {
      autoAnsweredQuestions,
      nextQuestion: currentQuestion?.question ? currentQuestion : null,
      finalDiagnosis
    }
  }

  /**
   * Delayed next question fetch to allow previous operations to complete
   */
  private async delayedNextQuestion(sessionId: string, delay: number): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, delay))
    return clinicalAssistantAPI.getNextDiagnosticQuestion(sessionId)
  }

  /**
   * Process ongoing chat messages with parallel optimizations
   * Maintains full OpenAI context while optimizing API calls
   */
  async processMessageWithParallelOps(
    sessionId: string,
    userMessage: string,
    currentDiagnosticQuestion: { question: string; answerList: string[] } | null,
    differentialDiagnosis: any[]
  ): Promise<{
    updatedDiagnosis: any[]
    autoAnsweredQuestions: string[]
    nextQuestion: { question: string; answerList: string[] } | null
    questionAnswered: boolean
  }> {
    let updatedDiagnosis = differentialDiagnosis
    let questionAnswered = false
    let autoAnsweredQuestions: string[] = []
    let nextQuestion: { question: string; answerList: string[] } | null = currentDiagnosticQuestion

    // If there's a current diagnostic question, check if user answered it
    if (currentDiagnosticQuestion) {
      console.log('Checking if current question was answered...')
      
      const extractedAnswer = await clinicalAssistantAPI.extractAnswerFromMessage(
        userMessage,
        currentDiagnosticQuestion.question,
        currentDiagnosticQuestion.answerList
      )

      if (extractedAnswer.answered && extractedAnswer.answerIndex !== null && extractedAnswer.confidence > 0.7) {
        questionAnswered = true
        console.log(`Current question answered with ${Math.round(extractedAnswer.confidence * 100)}% confidence`)

        // Parallel answer submission and diagnosis refresh
        const [submitSuccess] = await Promise.all([
          clinicalAssistantAPI.submitDiagnosticAnswer(sessionId, extractedAnswer.answerIndex),
          // Pre-warm the diagnosis refresh
          clinicalAssistantAPI.refreshDifferentialDiagnosis(sessionId).then(diagnosis => {
            updatedDiagnosis = diagnosis
          })
        ])

        if (submitSuccess) {
          // Process additional questions that might be auto-answered
          const nextQuestionResult = await clinicalAssistantAPI.getNextDiagnosticQuestion(sessionId)
          
          if (this.isValidDiagnosticQuestion(nextQuestionResult)) {
            const autoAnswerResult = await this.processAutoAnswersInParallel(
              sessionId,
              userMessage,
              nextQuestionResult
            )

            autoAnsweredQuestions = [
              `"${currentDiagnosticQuestion.question}" → ${currentDiagnosticQuestion.answerList[extractedAnswer.answerIndex]} (${Math.round(extractedAnswer.confidence * 100)}% confidence)`,
              ...autoAnswerResult.autoAnsweredQuestions
            ]
            
            nextQuestion = autoAnswerResult.nextQuestion
            updatedDiagnosis = autoAnswerResult.finalDiagnosis
          }
        }
      }
    }

    return {
      updatedDiagnosis,
      autoAnsweredQuestions,
      nextQuestion,
      questionAnswered
    }
  }
}

export const parallelProcessor = new ParallelDiagnosticProcessor()