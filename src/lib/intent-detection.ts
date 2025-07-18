import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface IntentDetectionResult {
  isDiagnostic: boolean
  confidence: number
  reasoning: string
}

export async function detectUserIntent(userMessage: string): Promise<IntentDetectionResult> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using smaller model for efficiency
      messages: [
        {
          role: 'system',
          content: `You are a medical intent classifier. Analyze if the user is trying to diagnose a medical condition or symptom versus asking general questions.

DIAGNOSTIC INTENT indicators:
- Describing symptoms (pain, discomfort, unusual sensations)
- Asking about medical conditions or diseases
- Seeking medical advice or diagnosis
- Describing physical or mental health issues
- Asking "what could this be" about health symptoms
- Medical emergency situations

GENERAL INTENT indicators:
- General health education questions
- Asking about medications or treatments conceptually
- Health prevention or wellness questions
- Medical research or learning
- General medical knowledge

Respond with JSON only:
{
  "isDiagnostic": boolean,
  "confidence": number (0-100),
  "reasoning": "brief explanation"
}`
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: 150,
      temperature: 0.1,
      response_format: { type: "json_object" }
    })

    const result = JSON.parse(response.choices[0].message.content || '{}')
    
    return {
      isDiagnostic: result.isDiagnostic || false,
      confidence: result.confidence || 0,
      reasoning: result.reasoning || 'No reasoning provided'
    }
  } catch (error) {
    console.error('Intent detection error:', error)
    // Conservative fallback - assume general intent on error
    return {
      isDiagnostic: false,
      confidence: 0,
      reasoning: 'Error during intent detection'
    }
  }
}

// Quick heuristic check for obvious diagnostic intent (backup method)
export function quickDiagnosticCheck(userMessage: string): boolean {
  const diagnosticKeywords = [
    'i have', 'i feel', 'i am experiencing', 'my symptoms', 'i think i have',
    'what could this be', 'diagnose', 'something wrong', 'not feeling well',
    'pain in', 'hurts', 'ache', 'symptoms', 'sick', 'ill', 'dizzy',
    'nausea', 'fever', 'cough', 'headache', 'chest pain', 'stomach',
    'throat', 'runny nose', 'fatigue', 'tired', 'weak', 'rash',
    'swollen', 'bleeding', 'shortness of breath', 'difficulty breathing'
  ]
  
  const lowerMessage = userMessage.toLowerCase()
  return diagnosticKeywords.some(keyword => lowerMessage.includes(keyword))
}