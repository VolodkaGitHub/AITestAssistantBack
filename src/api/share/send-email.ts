import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { emailProvider } from '../../lib/email-provider'

interface ChatMessage {
  id: string
  content: string
  sender: 'user' | 'assistant'
  timestamp: Date
}

interface SendEmailRequest {
  emails: string[]
  personalMessage?: string
  messages: ChatMessage[]
  sessionId?: string
  title: string
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const { emails, personalMessage, messages, sessionId, title }: SendEmailRequest = req.body

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: 'Email addresses are required' })
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: 'Messages are required' })
    }

    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const invalidEmails = emails.filter(email => !emailRegex.test(email))
    
    if (invalidEmails.length > 0) {
      return res.status(400).json({ 
        message: `Invalid email addresses: ${invalidEmails.join(', ')}` 
      })
    }

    // Format chat content
    const chatContent = messages
      .map(msg => {
        const role = msg.sender === 'user' ? 'You' : 'Treatment AI'
        const timestamp = new Date(msg.timestamp).toLocaleString()
        return `**${role}** (${timestamp}):\n${msg.content}\n`
      })
      .join('\n---\n\n')

    // Create email content
    const subject = `Shared: ${title}`
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; margin-bottom: 30px;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Treatment AI Chat Session</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Shared Healthcare Conversation</p>
        </div>

        ${personalMessage ? `
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Personal Message:</h3>
            <p style="margin: 0; color: #666; line-height: 1.6;">${personalMessage}</p>
          </div>
        ` : ''}

        <div style="background: white; border: 1px solid #e1e5e9; border-radius: 8px; overflow: hidden;">
          <div style="background: #f8f9fa; padding: 15px; border-bottom: 1px solid #e1e5e9;">
            <h2 style="margin: 0; color: #333; font-size: 18px;">Chat Conversation</h2>
            <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">
              Session ID: ${sessionId || 'N/A'} | ${messages.length} messages
            </p>
          </div>
          
          <div style="padding: 20px;">
            ${messages.map((msg, index) => {
              const isUser = msg.sender === 'user'
              const timestamp = new Date(msg.timestamp).toLocaleString()
              return `
                <div style="margin-bottom: ${index < messages.length - 1 ? '25px' : '0'};">
                  <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <div style="
                      background: ${isUser ? '#667eea' : '#28a745'}; 
                      color: white; 
                      padding: 4px 12px; 
                      border-radius: 20px; 
                      font-size: 12px; 
                      font-weight: bold;
                      margin-right: 10px;
                    ">
                      ${isUser ? 'You' : 'Treatment AI'}
                    </div>
                    <span style="color: #888; font-size: 12px;">${timestamp}</span>
                  </div>
                  <div style="
                    background: ${isUser ? '#f8f9ff' : '#f8fff8'}; 
                    padding: 15px; 
                    border-radius: 8px; 
                    border-left: 4px solid ${isUser ? '#667eea' : '#28a745'};
                    line-height: 1.6;
                    color: #333;
                  ">
                    ${msg.content.replace(/\n/g, '<br>')}
                  </div>
                </div>
              `
            }).join('')}
          </div>
        </div>

        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #666; font-size: 14px;">
            This conversation was shared from <strong>Treatment AI</strong><br>
            <em>Your comprehensive healthcare AI assistant</em>
          </p>
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e1e5e9;">
            <p style="margin: 0; color: #888; font-size: 12px;">
              <strong>Medical Disclaimer:</strong> This AI conversation is for educational purposes only. 
              Always consult with qualified healthcare professionals for medical advice.
            </p>
          </div>
        </div>
      </div>
    `

    // Send emails to all recipients
    const results = await Promise.allSettled(
      emails.map(email => 
        emailProvider.sendEmail(email, subject, htmlContent)
      )
    )

    // Check results
    const successful = results.filter(result => result.status === 'fulfilled').length
    const failed = results.filter(result => result.status === 'rejected').length

    if (failed === 0) {
      return res.status(200).json({ 
        success: true, 
        message: `Email sent successfully to ${successful} recipient${successful > 1 ? 's' : ''}`,
        details: { successful, failed }
      })
    } else if (successful > 0) {
      return res.status(206).json({ 
        success: true, 
        message: `Email sent to ${successful} recipient${successful > 1 ? 's' : ''}, failed for ${failed}`,
        details: { successful, failed }
      })
    } else {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send email to all recipients',
        details: { successful, failed }
      })
    }

  } catch (error) {
    console.error('Send email error:', error)
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to send email' 
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}