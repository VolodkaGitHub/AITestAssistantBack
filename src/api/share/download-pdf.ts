import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { jsPDF } from 'jspdf'

interface ChatMessage {
  id: string
  content: string
  sender: 'user' | 'assistant'
  timestamp: Date
}

interface PDFRequest {
  messages: ChatMessage[]
  sessionId?: string
  title: string
}

/**
 * @openapi
 * /api/share/download-pdf:
 *   post:
 *     summary: Generate a PDF document from a chat session
 *     description: Creates a PDF file containing chat messages from a treatment AI session, including metadata and timestamps.
 *     tags:
 *       - Share
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *               - title
 *             properties:
 *               messages:
 *                 type: array
 *                 description: List of chat messages to include in the PDF.
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - content
 *                     - sender
 *                     - timestamp
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "msg_123"
 *                     content:
 *                       type: string
 *                       example: "Hello, how can I help you?"
 *                     sender:
 *                       type: string
 *                       enum: [user, assistant]
 *                       example: "assistant"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-07-21T10:00:00Z"
 *               sessionId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional session identifier.
 *                 example: "session_abc123"
 *               title:
 *                 type: string
 *                 description: Title of the PDF document.
 *                 example: "Treatment AI Chat Session"
 *     responses:
 *       200:
 *         description: PDF document generated successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Bad request, e.g. missing or invalid messages array
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Messages are required
 *       405:
 *         description: Method not allowed, only POST supported
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Server error during PDF generation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to generate PDF
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { messages, sessionId, title }: PDFRequest = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages are required' })
    }

    // Create new PDF document
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.width
    const pageHeight = doc.internal.pageSize.height
    const margin = 20
    const maxWidth = pageWidth - 2 * margin
    let yPosition = margin

    // Helper function to add text with word wrapping
    const addWrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize: number = 12) => {
      doc.setFontSize(fontSize)
      const lines = doc.splitTextToSize(text, maxWidth)
      
      for (let i = 0; i < lines.length; i++) {
        if (y + (i * fontSize * 0.35) > pageHeight - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(lines[i], x, y + (i * fontSize * 0.35))
      }
      
      return y + (lines.length * fontSize * 0.35) + 5
    }

    // Add header
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('Treatment AI Chat Session', margin, yPosition)
    yPosition += 15

    // Add metadata
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition)
    yPosition += 8
    
    if (sessionId) {
      doc.text(`Session ID: ${sessionId}`, margin, yPosition)
      yPosition += 8
    }
    
    doc.text(`Total Messages: ${messages.length}`, margin, yPosition)
    yPosition += 15

    // Add separator line
    doc.setLineWidth(0.5)
    doc.line(margin, yPosition, pageWidth - margin, yPosition)
    yPosition += 15

    // Add messages
    for (const message of messages) {
      // Check if we need a new page
      if (yPosition > pageHeight - 60) {
        doc.addPage()
        yPosition = margin
      }

      // Add sender label
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      const senderLabel = message.sender === 'user' ? 'You:' : 'Treatment AI:'
      doc.text(senderLabel, margin, yPosition)
      yPosition += 10

      // Add timestamp
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(128, 128, 128)
      const timestamp = new Date(message.timestamp).toLocaleString()
      doc.text(timestamp, margin, yPosition)
      yPosition += 8

      // Add message content
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 0)
      
      // Clean up message content (remove markdown and HTML)
      let cleanContent = message.content
        .replace(/#{1,6}\s/g, '') // Remove markdown headers
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown
        .replace(/\*(.*?)\*/g, '$1') // Remove italic markdown
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ') // Replace HTML entities
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')

      yPosition = addWrappedText(cleanContent, margin, yPosition, maxWidth, 10)
      yPosition += 10

      // Add separator between messages
      doc.setLineWidth(0.2)
      doc.setDrawColor(200, 200, 200)
      doc.line(margin, yPosition, pageWidth - margin, yPosition)
      yPosition += 10
    }

    // Add footer
    const pageCount = doc.internal.pages.length - 1
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(128, 128, 128)
      doc.text(
        `Page ${i} of ${pageCount} - Treatment AI Chat Session`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      )
    }

    // Generate PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', pdfBuffer.length)
    res.setHeader('Content-Disposition', `attachment; filename="treatment-ai-chat-${sessionId || 'session'}-${Date.now()}.pdf"`)

    // Send PDF
    res.send(pdfBuffer)

  } catch (error) {
    console.error('Error generating PDF:', error)
    res.status(500).json({ error: 'Failed to generate PDF' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}