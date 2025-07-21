/**
 * Get Medication Details by ID
 * Retrieves complete medication information from static database
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { validateSessionToken } from '../../lib/auth-database';
import { medicationsDatabase, MedicationEntry } from '../../lib/medications-database';

interface GetMedicationResponse {
  success: boolean;
  medication?: MedicationEntry;
  error?: string;
}

/**
 * @openapi
 * /api/medications/get-medication/{id}:
 *   get:
 *     summary: Get Medication Details by ID
 *     description: Retrieves complete medication information from static database.
 *     tags:
 *       - Medications
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the medication
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *           example: Bearer YOUR_TOKEN_HERE
 *         description: Bearer token for session authentication
 *     responses:
 *       200:
 *         description: Successfully retrieved medication
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 medication:
 *                   $ref: '#/components/schemas/MedicationEntry'
 *       400:
 *         description: Invalid or missing ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       404:
 *         description: Medication not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     MedicationEntry:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         dosage:
 *           type: string
 *         form:
 *           type: string
 *         description:
 *           type: string
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetMedicationResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Validate session
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization token'
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await validateSessionToken(sessionToken);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session token'
      });
    }

    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Medication ID is required'
      });
    }

    // Get medication from static database
    const medication = await medicationsDatabase.getMedicationById(id);

    if (!medication) {
      return res.status(404).json({
        success: false,
        error: 'Medication not found'
      });
    }

    return res.status(200).json({
      success: true,
      medication
    });

  } catch (error) {
    console.error('Get medication error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}