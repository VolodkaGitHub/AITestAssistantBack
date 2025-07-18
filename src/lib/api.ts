import axios from 'axios'

interface PatientData {
  firstName: string
  lastName: string
  email: string
  dateOfBirth: string
  sex: string
  city: string
}

interface SessionData {
  sessionId: string
  differentialDiagnosis: any[]
  firstQuestion?: { question: string; answerList: string[] } | null
}

class ClinicalAssistantAPI {
  private jwtToken: string = ''
  private tokenExpiry: number = 0

  async getJWTToken(): Promise<string> {
    // Check if token is still valid (with 5-minute buffer)
    if (this.jwtToken && Date.now() < this.tokenExpiry - 300000) {
      return this.jwtToken
    }

    try {
      const response = await axios.post('/api/auth/jwt')

      this.jwtToken = response.data.access_token || ''
      this.tokenExpiry = Date.now() + (3600 * 1000) // 1 hour
      return this.jwtToken
    } catch (error) {
      console.error('JWT token retrieval failed:', error)
      throw new Error('Authentication failed')
    }
  }

  // Symptom extraction now handled server-side in session creation

  async createSession(data: { patientData: PatientData; initialSymptoms: string; sessionToken?: string }): Promise<SessionData> {
    console.log('🎯 API CLIENT - createSession called with:', {
      patientData: data.patientData,
      initialSymptoms: data.initialSymptoms,
      hasSessionToken: !!data.sessionToken
    })
    
    try {
      const jwt = await this.getJWTToken()
      console.log('🎯 API CLIENT - Got JWT token, making POST to /api/session/create')
      
      const response = await axios.post('/api/session/create', {
        patientData: data.patientData,
        initialSymptoms: data.initialSymptoms,
        sessionToken: data.sessionToken,
        jwtToken: jwt
      })

      console.log('🎯 API CLIENT - Session creation response:', response.data)
      return response.data
    } catch (error) {
      console.error('🎯 API CLIENT - Session creation failed:', error)
      throw new Error('Failed to create clinical session')
    }
  }

  async generateResponse(userMessage: string, differentialDiagnosis: any[], sessionId: string, diagnosticQuestion?: { question: string; answerList: string[] }, sessionToken?: string, conversationHistory?: any[]): Promise<string> {
    try {
      const response = await axios.post('/api/chat/generate', {
        userMessage,
        differentialDiagnosis,
        sessionId,
        diagnosticQuestion,
        sessionToken,
        conversationHistory
      })

      return response.data.response
    } catch (error) {
      console.error('AI response generation failed:', error)
      return "I apologize, but I'm having trouble processing your request right now. Please consult with a healthcare provider for assistance with your medical concerns."
    }
  }

  async generateGeneralResponse(userMessage: string, mentionedData: any[], sessionToken?: string): Promise<string> {
    try {
      // Convert mentioned data to health context format
      const healthContext = mentionedData.map(data => {
        return `${data.type.toUpperCase()} DATA: ${JSON.stringify(data.data, null, 2)}`
      }).join('\n\n')
      
      let contextualMessage = userMessage
      if (healthContext) {
        contextualMessage = `${userMessage}\n\n[HEALTH DATA CONTEXT: The user has included the following health data for context:\n\n${healthContext}\n\nPlease incorporate relevant insights from this data naturally into your response.]`
      }

      const response = await axios.post('/api/chat/general', {
        userMessage: contextualMessage,
        sessionToken,
        includeHealthContext: mentionedData.length > 0
      })

      return response.data.response
    } catch (error) {
      console.error('General AI response generation failed:', error)
      return "I apologize, but I'm having trouble processing your request right now. Please try again."
    }
  }

  async getNextDiagnosticQuestion(sessionId: string): Promise<{ question: string | null; answerList: string[] | null }> {
    try {
      const response = await axios.post('/api/diagnostic/get-next-question', {
        sessionId
      })

      return {
        question: response.data.question,
        answerList: response.data.answerList
      }
    } catch (error) {
      console.error('Get diagnostic question failed:', error)
      return { question: null, answerList: null }
    }
  }

  async submitDiagnosticAnswer(sessionId: string, answerIndex: number): Promise<boolean> {
    try {
      const response = await axios.post('/api/diagnostic/submit-answer', {
        persistanceSession: sessionId,
        answerIndex
      })

      return response.data.success
    } catch (error) {
      console.error('Submit diagnostic answer failed:', error)
      return false
    }
  }

  async addSymptomsToQueue(sessionId: string, sdcoIds: string[]): Promise<boolean> {
    try {
      const response = await axios.post('/api/symptoms/queue', {
        sessionId,
        sdcoIds
      })

      return response.data.success
    } catch (error) {
      console.error('Add symptoms to queue failed:', error)
      return false
    }
  }

  async refreshDifferentialDiagnosis(sessionId: string): Promise<any[]> {
    try {
      const response = await axios.post('/api/session/refresh-diagnosis', {
        sessionId
      })

      return response.data.differentialDiagnosis || []
    } catch (error) {
      console.error('Refresh differential diagnosis failed:', error)
      return []
    }
  }

  async checkIfAnsweredQuestion(userMessage: string, question: string, answerList: string[]): Promise<{ answered: boolean; answerIndex: number | null }> {
    try {
      const response = await axios.post('/api/chat/check-answer', {
        userMessage,
        question,
        answerList
      })

      return {
        answered: response.data.answered,
        answerIndex: response.data.answerIndex
      }
    } catch (error) {
      console.error('Check answer failed:', error)
      return { answered: false, answerIndex: null }
    }
  }

  async extractAnswerFromMessage(userMessage: string, question: string, answerList: string[]): Promise<{ answered: boolean; answerIndex: number | null; confidence: number; explanation: string }> {
    try {
      const response = await axios.post('/api/chat/extract-answer', {
        userMessage,
        question,
        answerList
      })

      return {
        answered: response.data.answered,
        answerIndex: response.data.answerIndex,
        confidence: response.data.confidence,
        explanation: response.data.explanation
      }
    } catch (error) {
      console.error('Extract answer failed:', error)
      return { answered: false, answerIndex: null, confidence: 0, explanation: 'Error analyzing response' }
    }
  }

  async detectAnswer(userMessage: string, diagnosticQuestion: { question: string; answerList: string[] }): Promise<{ answered: boolean; answerIndex: number | null; confidence: number; explanation: string }> {
    try {
      const response = await axios.post('/api/chat/detect-answer', {
        userMessage,
        diagnosticQuestion
      })

      return response.data
    } catch (error) {
      console.error('Answer detection failed:', error)
      return { answered: false, answerIndex: null, confidence: 0, explanation: 'Error analyzing response' }
    }
  }

  async getNextUnansweredQuestion(sessionId: string): Promise<{ question: string; answerList: string[] } | null> {
    try {
      const response = await axios.post('/api/diagnostic/get-next-unanswered-question', {
        sessionId
      })

      if (response.data.question) {
        return {
          question: response.data.question,
          answerList: response.data.answerList
        }
      }
      
      return null
    } catch (error) {
      console.error('Get next unanswered question failed:', error)
      return null
    }
  }
}

export const clinicalAssistantAPI = new ClinicalAssistantAPI()