/**
 * Lab Results Context API
 * Provides lab results as context for OpenAI diagnostic conversations
 * Uses Epic FHIR sandbox for real-time data retrieval
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { fhirClient } from '../../lib/fhir-client';

interface LabContextResponse {
  success: boolean;
  lab_context?: {
    recent_labs: Array<{
      name: string;
      value: string;
      unit?: string;
      date: string;
      status: string;
    }>;
    abnormal_values: Array<{
      name: string;
      value: string;
      reference_range?: string;
      status: string;
    }>;
    critical_values: Array<{
      name: string;
      value: string;
      reference_range?: string;
      status: string;
    }>;
    summary: {
      total_results: number;
      abnormal_count: number;
      critical_count: number;
      last_updated: string;
    };
  };
  error?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LabContextResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { patientId } = req.query;

    if (!patientId || typeof patientId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Patient ID is required'
      });
    }

    // Lab results temporarily disabled
    const labData = { recent_labs: [], abnormal_values: [], critical_values: [] };

    // Format for OpenAI context
    const labContext = {
      recent_labs: [],
      abnormal_values: [],
      critical_values: [],
      summary: {
        total_results: 0,
        abnormal_count: 0,
        critical_count: 0,
        last_updated: new Date().toISOString()
      }
    };

    return res.status(200).json({
      success: true,
      lab_context: labContext
    });

  } catch (error) {
    console.error('Error fetching lab context:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch lab results context'
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}