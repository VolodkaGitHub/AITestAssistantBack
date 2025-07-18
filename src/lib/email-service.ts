// Email service for sending scheduled prompt results
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface EmailData {
  to: string
  subject: string
  htmlContent: string
  textContent?: string
}

export async function sendOTPEmail(
  userEmail: string,
  otpCode: string,
  type: 'signup' | 'login' | 'verification'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await resend.emails.send({
      from: 'noreply@opinions.doctor',
      to: userEmail,
      subject: `Your ${type} verification code`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>🏥 Treatment AI Verification</h2>
          <p>Your verification code is:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0;">
            ${otpCode}
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    })

    return {
      success: true,
      messageId: response.data?.id
    }
  } catch (error: any) {
    console.error('OTP email sending failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

export async function sendScheduledPromptResult(
  userEmail: string,
  promptTitle: string,
  aiResult: string,
  mentionedData: any,
  executionTime: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const htmlContent = generateResultEmail(promptTitle, aiResult, mentionedData, executionTime)
    const textContent = generateTextEmail(promptTitle, aiResult, executionTime)

    const response = await resend.emails.send({
      from: 'noreply@opinions.doctor',
      to: userEmail,
      subject: `Scheduled Health Analysis: ${promptTitle}`,
      html: htmlContent,
      text: textContent
    })

    return {
      success: true,
      messageId: response.data?.id
    }
  } catch (error: any) {
    console.error('Email sending failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

export async function sendPromptShareNotification(
  recipientEmail: string,
  senderEmail: string,
  promptTitle: string,
  shareUrl: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const htmlContent = generateShareNotificationEmail(senderEmail, promptTitle, shareUrl)
    const textContent = `${senderEmail} has shared a scheduled prompt "${promptTitle}" with you. Access it at: ${shareUrl}`

    const response = await resend.emails.send({
      from: 'noreply@opinions.doctor',
      to: recipientEmail,
      subject: `Shared Health Prompt: ${promptTitle}`,
      html: htmlContent,
      text: textContent
    })

    return {
      success: true,
      messageId: response.data?.id
    }
  } catch (error: any) {
    console.error('Share notification email failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

function generateResultEmail(
  promptTitle: string,
  aiResult: string,
  mentionedData: any,
  executionTime: string
): string {
  const formattedTime = new Date(executionTime).toLocaleString()
  const dataTypes = Object.keys(mentionedData).join(', ') || 'None'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scheduled Health Analysis Results</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e1e5e9; border-top: none; }
    .result-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .data-summary { background: #e3f2fd; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #6c757d; border-radius: 0 0 10px 10px; }
    .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .timestamp { font-size: 14px; color: #e1e5e9; }
    h2 { color: #667eea; margin-top: 25px; }
    .highlight { background: #fff3cd; padding: 2px 4px; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">🏥 Treatment AI</div>
    <h1>Scheduled Health Analysis</h1>
    <div class="timestamp">Generated on ${formattedTime}</div>
  </div>
  
  <div class="content">
    <h2>📋 Prompt: ${promptTitle}</h2>
    
    <div class="data-summary">
      <strong>📊 Data Sources Analyzed:</strong> ${dataTypes}
    </div>
    
    <div class="result-box">
      <h3>🤖 AI Analysis Results</h3>
      ${aiResult.replace(/\n/g, '<br>')}
    </div>
    
    <h2>💡 About This Analysis</h2>
    <p>This analysis was generated by Treatment AI using your scheduled prompt and current health data. The insights are based on the information available at the time of execution.</p>
    
    <p><strong>⚠️ Important:</strong> This analysis is for informational purposes only and should not replace professional medical advice. Always consult with healthcare providers for medical decisions.</p>
  </div>
  
  <div class="footer">
    <p>Powered by our Global Library of Medicine™</p>
    <p>© 2025 Treatment AI - Advancing Healthcare Through AI</p>
  </div>
</body>
</html>`
}

function generateTextEmail(promptTitle: string, aiResult: string, executionTime: string): string {
  const formattedTime = new Date(executionTime).toLocaleString()
  
  return `
TREATMENT AI - SCHEDULED HEALTH ANALYSIS
Generated on ${formattedTime}

PROMPT: ${promptTitle}

AI ANALYSIS RESULTS:
${aiResult}

IMPORTANT: This analysis is for informational purposes only and should not replace professional medical advice. Always consult with healthcare providers for medical decisions.

Powered by our Global Library of Medicine™
© 2025 Treatment AI
`
}

export async function sendPasswordResetEmail(email: string, resetToken: string, userName: string, isSetup: boolean = false): Promise<boolean> {
  try {
    // Validate API key
    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY environment variable is not set')
      return false
    }
    // Use production domain or fallback to Replit domain
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://opinions.doctor'
      : process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'http://localhost:5000'
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`
    const emailType = isSetup ? 'setup' : 'reset'
    const subject = isSetup ? 'Set Up Your Treatment AI Password' : 'Reset Your Treatment AI Password'
    const heading = isSetup ? 'Password Setup Required' : 'Password Reset Request'
    const description = isSetup 
      ? 'Your Treatment AI account needs a password to be set up. Click the button below to create a secure password:'
      : 'We received a request to reset your password for your Treatment AI account. Click the button below to set a new password:'
    const buttonText = isSetup ? 'Set Up My Password' : 'Reset My Password'
    
    const response = await resend.emails.send({
      from: 'noreply@opinions.doctor',
      to: [email],
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #059669; margin: 0;">Treatment AI</h1>
            <p style="color: #6B7280; margin: 5px 0;">Powered by Global Library of Medicine</p>
          </div>
          
          <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 30px;">
            <h2 style="color: #111827; margin-bottom: 20px;">${heading}</h2>
            <p style="color: #374151; margin-bottom: 20px;">
              Hello ${userName},
            </p>
            <p style="color: #374151; margin-bottom: 20px;">
              ${description}
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                ${buttonText}
              </a>
            </div>
            
            <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
              If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #059669; font-size: 14px; word-break: break-all;">
              ${resetUrl}
            </p>
            
            <div style="border-top: 1px solid #E5E7EB; margin: 30px 0; padding-top: 20px;">
              <p style="color: #DC2626; font-size: 14px; margin-bottom: 10px;">
                <strong>Security Notice:</strong>
              </p>
              <ul style="color: #6B7280; font-size: 14px; margin: 0; padding-left: 20px;">
                <li>This link will expire in 1 hour</li>
                <li>If you didn't request this password reset, please ignore this email</li>
                <li>Your account will remain secure until you click the link above</li>
              </ul>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 30px; color: #9CA3AF; font-size: 14px;">
            <p>This is an automated message from Treatment AI. Please do not reply to this email.</p>
          </div>
        </div>
      `
    })

    console.log(`Password reset email sent successfully:`, response.data?.id)
    console.log(`Email sent to: ${email} with reset URL: ${resetUrl}`)
    return true
  } catch (error) {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://opinions.doctor'
      : process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : 'http://localhost:5000'
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`
    console.error(`Failed to send password reset email:`, error)
    console.error(`Error details:`, {
      email,
      resetUrl: resetUrl,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined
    })
    return false
  }
}

function generateShareNotificationEmail(
  senderEmail: string,
  promptTitle: string,
  shareUrl: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shared Health Prompt</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e1e5e9; border-top: none; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #6c757d; border-radius: 0 0 10px 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🤝 Shared Health Prompt</h1>
  </div>
  
  <div class="content">
    <p><strong>${senderEmail}</strong> has shared a scheduled health prompt with you:</p>
    <h2>📋 "${promptTitle}"</h2>
    
    <p>You can now access and manage this shared prompt through your Treatment AI dashboard.</p>
    
    <div style="text-align: center;">
      <a href="${shareUrl}" class="cta-button">Access Shared Prompt</a>
    </div>
    
    <p><em>This shared prompt will execute automatically according to its schedule and send results to both you and the original creator (if permissions allow).</em></p>
  </div>
  
  <div class="footer">
    <p>Powered by our Global Library of Medicine™</p>
    <p>© 2025 Treatment AI</p>
  </div>
</body>
</html>`
}

// Create service instance for export
const emailService = {
  sendOTPEmail,
  sendPasswordResetEmail
}

export default emailService
export { emailService }