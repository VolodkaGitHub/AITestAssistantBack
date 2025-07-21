import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { medicationsDatabase } from '../../lib/medications-database';

// Configure formidable to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * @openapi
 * /api/medications/scan-prescription:
 *   post:
 *     summary: Scan and analyze prescription bottle image
 *     description: Accepts an image upload, extracts medication details using AI, and matches with database.
 *     tags:
 *       - Medications
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file of the prescription bottle.
 *     responses:
 *       200:
 *         description: Prescription analyzed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 extracted_data:
 *                   type: object
 *                   properties:
 *                     medication_name:
 *                       type: string
 *                       nullable: true
 *                     dosage:
 *                       type: string
 *                       nullable: true
 *                     quantity:
 *                       type: string
 *                       nullable: true
 *                     frequency:
 *                       type: string
 *                       nullable: true
 *                     doctor:
 *                       type: string
 *                       nullable: true
 *                     pharmacy:
 *                       type: string
 *                       nullable: true
 *                     date_prescribed:
 *                       type: string
 *                       nullable: true
 *                     ndc_number:
 *                       type: string
 *                       nullable: true
 *                     instructions:
 *                       type: string
 *                       nullable: true
 *                     warnings:
 *                       type: string
 *                       nullable: true
 *                     confidence:
 *                       type: number
 *                       format: float
 *                       description: Confidence score (0 to 1)
 *                 matched_medication:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                 message:
 *                   type: string
 *                   example: Prescription bottle analyzed successfully
 *       400:
 *         description: Missing image file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: No image file provided
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to analyze prescription bottle
 *                 details:
 *                   type: string
 *                   example: API key not configured
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📷 SCAN API: Starting prescription scan processing');
    
    // Ensure tmp directory exists
    const tmpDir = './tmp';
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
      console.log('📷 SCAN API: Created tmp directory');
    }
    
    // Parse the uploaded file
    const form = formidable({
      uploadDir: tmpDir,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    console.log('📷 SCAN API: Parsing uploaded file...');
    const [fields, files] = await form.parse(req);
    console.log('📷 SCAN API: Files received:', Object.keys(files));
    
    const file = Array.isArray(files.image) ? files.image[0] : files.image;

    if (!file) {
      console.log('📷 SCAN API ERROR: No image file in request');
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    console.log('📷 SCAN API: File details:', {
      originalFilename: file.originalFilename,
      mimetype: file.mimetype,
      size: file.size,
      filepath: file.filepath
    });

    // Read the image file and convert to base64
    console.log('📷 SCAN API: Reading image file...');
    const imageBuffer = fs.readFileSync(file.filepath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = file.mimetype || 'image/jpeg';
    console.log('📷 SCAN API: Image converted to base64, size:', base64Image.length);

    // Clean up uploaded file
    fs.unlinkSync(file.filepath);
    console.log('📷 SCAN API: Temporary file cleaned up');

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log('📷 SCAN API ERROR: OpenAI API key not found');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Analyze the prescription bottle image with OpenAI Vision
    console.log('📷 SCAN API: Sending image to OpenAI for analysis...');
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this prescription bottle image and extract the following medication information:

1. Medication name (generic and brand if visible)
2. Dosage/strength (e.g., 500mg, 10mg)
3. Quantity prescribed
4. Frequency/instructions (e.g., "Take 1 tablet twice daily")
5. Prescribing doctor name
6. Pharmacy name
7. Date prescribed/filled
8. NDC number (if visible)
9. Any warnings or special instructions

Please format the response as a JSON object with these exact field names:
{
  "medication_name": "",
  "dosage": "",
  "quantity": "",
  "frequency": "",
  "doctor": "",
  "pharmacy": "",
  "date_prescribed": "",
  "ndc_number": "",
  "instructions": "",
  "warnings": "",
  "confidence": 0.95
}

If any information is not clearly visible or readable, set that field to null. Include a confidence score (0-1) indicating how confident you are in the extraction accuracy.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    console.log('📷 SCAN API: OpenAI response received');
    const rawContent = response.choices[0].message.content || '{}';
    console.log('📷 SCAN API: Raw OpenAI response:', rawContent);
    
    // Parse the extracted data
    let extractedData;
    try {
      // Remove any markdown formatting if present
      const cleanContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extractedData = JSON.parse(cleanContent);
      console.log('📷 SCAN API: Extracted data:', extractedData);
    } catch (parseError) {
      console.error('📷 SCAN API ERROR: Failed to parse OpenAI response:', parseError);
      return res.status(500).json({ 
        error: 'Failed to parse prescription information',
        details: 'The AI response could not be processed'
      });
    }

    // Match extracted medication with static database
    let matchedMedication = null;
    if (extractedData.medication_name) {
      console.log('📋 SCAN API: Searching static database for:', extractedData.medication_name);
      
      // Ensure medications database schema exists (but don't auto-populate)
      await medicationsDatabase.initializeSchema();
      
      // Search for the medication in our static database
      const searchResults = await medicationsDatabase.searchMedications(extractedData.medication_name, 5);
      if (searchResults.length > 0) {
        matchedMedication = searchResults[0]; // Take the best match
        console.log('📋 SCAN API: Found medication match:', matchedMedication.name);
      } else {
        console.log('📋 SCAN API: No medication match found in database');
      }
    }

    // Return the extracted medication information with database match
    console.log('📷 SCAN API: Sending success response to client');
    res.status(200).json({
      success: true,
      extracted_data: extractedData,
      matched_medication: matchedMedication,
      message: "Prescription bottle analyzed successfully"
    });

  } catch (error) {
    console.error('📷 SCAN API ERROR: Prescription scanning failed:', error);
    
    // Provide specific error messages
    let errorMessage = 'Failed to analyze prescription bottle';
    let errorDetails = 'Unknown error';
    
    if (error instanceof Error) {
      errorDetails = error.message;
      
      // Provide more specific error messages based on error type
      if (errorDetails.includes('API key')) {
        errorMessage = 'OpenAI API key configuration error';
      } else if (errorDetails.includes('rate limit')) {
        errorMessage = 'API rate limit exceeded. Please try again in a moment.';
      } else if (errorDetails.includes('timeout')) {
        errorMessage = 'Request timeout. Please try again.';
      } else if (errorDetails.includes('invalid image')) {
        errorMessage = 'Invalid image format. Please use a clear photo of the prescription bottle.';
      }
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: errorDetails
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}