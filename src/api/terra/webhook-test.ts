/**
 * Terra Webhook Test Endpoint
 * Simulates processing the real Terra payload you shared
 */

import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool'

const dbPool = DatabasePool.getInstance();

// Function to store enrichment scores in database
async function storeEnrichmentScore(enrichmentData: any) {
  try {
    const query = `
      INSERT INTO enrichment_scores (
        data_type, provider, terra_user_id, user_id,
        sleep_score, stress_score, respiratory_score,
        sleep_contributors, stress_contributors, respiratory_contributors,
        summary_date, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id, provider, data_type, summary_date) 
      DO UPDATE SET
        sleep_score = EXCLUDED.sleep_score,
        stress_score = EXCLUDED.stress_score,
        respiratory_score = EXCLUDED.respiratory_score,
        sleep_contributors = EXCLUDED.sleep_contributors,
        stress_contributors = EXCLUDED.stress_contributors,
        respiratory_contributors = EXCLUDED.respiratory_contributors,
        recorded_at = EXCLUDED.recorded_at
    `;
    
    // Find the user_id from the Terra user ID
    const userQuery = `SELECT user_id FROM wearable_connections WHERE terra_user_id = $1 LIMIT 1`;
    const userResult = await dbPool.query(userQuery, [enrichmentData.terra_user_id]);
    const userId = userResult.rows[0]?.user_id || enrichmentData.terra_user_id;
    
    await dbPool.query(query, [
      enrichmentData.data_type,
      enrichmentData.provider,
      enrichmentData.terra_user_id,
      userId,
      enrichmentData.sleep_score,
      enrichmentData.stress_score,
      enrichmentData.respiratory_score,
      enrichmentData.sleep_contributors,
      enrichmentData.stress_contributors,
      enrichmentData.respiratory_contributors,
      enrichmentData.summary_date,
      enrichmentData.recorded_at
    ]);
    
    console.log(`✅ Stored enrichment score: ${enrichmentData.data_type} for Terra user ${enrichmentData.terra_user_id}`);
    return true;
  } catch (error) {
    console.error('Error storing enrichment score:', error);
    return false;
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('🧪 Testing webhook processing with real Terra payload structure...');

    // Process multiple enrichment score types with real Terra data structure
    const enrichmentPayloads = [
      {
        user: { user_id: "83d0e200-629d-4dac-8e29-93e9a889c8bc", provider: "OURA" },
        data: [{
          summary_date: "2025-07-05T00:00:00.000000-07:00",
          data_enrichment: {
            sleep_score: 74.5,
            sleep_contributors: { rem: 87, deep: 62, light: 78, efficiency: 89 }
          }
        }],
        type: "sleep"
      },
      {
        user: { user_id: "83d0e200-629d-4dac-8e29-93e9a889c8bc", provider: "OURA" },
        data: [{
          summary_date: "2025-07-05T00:00:00.000000-07:00",
          data_enrichment: {
            total_stress_score: 29.7,
            stress_contributors: { hrv: 45.2, hr: 2.1, sleep: 68.9, steps: 31.4 }
          }
        }],
        type: "daily"
      },
      {
        user: { user_id: "83d0e200-629d-4dac-8e29-93e9a889c8bc", provider: "OURA" },
        data: [{
          summary_date: "2025-07-05T00:00:00.000000-07:00",
          data_enrichment: {
            respiratory_score: 82.3,
            respiratory_contributors: { oxygen_saturation: 97, breathing_regularity: 85 }
          }
        }],
        type: "body"
      }
    ];

    // Find user connection
    const connectionQuery = `SELECT * FROM wearable_connections WHERE terra_user_id = $1 LIMIT 1`;
    const connectionResult = await dbPool.query(connectionQuery, [enrichmentPayloads[0].user.user_id]);
    
    if (connectionResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No connection found for Terra user' });
    }

    const connection = connectionResult.rows[0];
    console.log('🔗 Found connection:', { user_id: connection.user_id, provider: connection.provider });

    const storedScores = [];

    // Process each enrichment payload
    for (const payload of enrichmentPayloads) {
      const dataEntry = payload.data[0];
      const enrichmentData = dataEntry.data_enrichment;

      console.log(`📊 Processing ${payload.type} enrichment data:`, {
        sleep_score: (enrichmentData as any).sleep_score,
        stress_score: (enrichmentData as any).total_stress_score,
        respiratory_score: (enrichmentData as any).respiratory_score
      });

      const enrichmentScores = {
        data_type: payload.type,
        provider: connection.provider,
        terra_user_id: payload.user.user_id,
        
        // Sleep enrichment scores
        sleep_score: (enrichmentData as any).sleep_score || null,
        sleep_contributors: (enrichmentData as any).sleep_contributors || null,
        
        // Stress enrichment scores - handle both field names
        stress_score: (enrichmentData as any).stress_score || (enrichmentData as any).total_stress_score || null,
        stress_contributors: (enrichmentData as any).stress_contributors || null,
        
        // Respiratory enrichment scores
        respiratory_score: (enrichmentData as any).respiratory_score || null,
        respiratory_contributors: (enrichmentData as any).respiratory_contributors || null,
        
        // Metadata
        summary_date: dataEntry.summary_date,
        recorded_at: new Date().toISOString()
      };

      // Store in database
      const stored = await storeEnrichmentScore(enrichmentScores);
      
      if (stored) {
        console.log(`✅ Stored ${payload.type} enrichment scores successfully`);
        storedScores.push({
          type: payload.type,
          sleep_score: enrichmentScores.sleep_score,
          stress_score: enrichmentScores.stress_score,
          respiratory_score: enrichmentScores.respiratory_score
        });
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: 'All Terra enrichment scores updated successfully',
      updated_scores: storedScores
    });

  } catch (error) {
    console.error('Webhook test error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}