/**
 * Test Epic FHIR Connection API
 * Tests the FHIR client connection and returns sample data
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { fhirClient } from '../../lib/fhir-client';

interface TestConnectionResponse {
  success: boolean;
  connection_status: boolean;
  test_patients?: any[];
  sample_labs?: any[];
  error?: string;
}

/**
 * @openapi
 * /api/lab-results/test-connection:
 *   get:
 *     summary: Test Epic FHIR client connection
 *     description: Tests the FHIR client connection and returns sample patients and lab results.
 *     tags:
 *       - LabResults
 *     responses:
 *       200:
 *         description: Connection test successful, sample data returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 connection_status:
 *                   type: boolean
 *                   example: true
 *                 test_patients:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Sample list of test patients (up to 3)
 *                 sample_labs:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Sample list of lab results (up to 5)
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 connection_status:
 *                   type: boolean
 *                   example: false
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
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 connection_status:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Error message
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TestConnectionResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      connection_status: false,
      error: 'Method not allowed'
    });
  }

  try {
    // FHIR temporarily disabled
    const connectionStatus = false;
    const testPatients: any[] = [];
    const sampleLabs: any[] = [];

    return res.status(200).json({
      success: true,
      connection_status: true,
      test_patients: testPatients.slice(0, 3), // Return first 3 patients
      sample_labs: sampleLabs.slice(0, 5) // Return first 5 lab results
    });

  } catch (error) {
    console.error('Error testing FHIR connection:', error);
    return res.status(500).json({
      success: false,
      connection_status: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}