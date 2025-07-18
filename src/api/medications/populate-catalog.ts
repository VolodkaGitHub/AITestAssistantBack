import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool';
import { getValidJWTToken } from '../../lib/jwt-manager';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await DatabasePool.getClient();

  try {
    // Get JWT token for API authentication
    const jwtToken = await getValidJWTToken();
    if (!jwtToken) {
      return res.status(401).json({ error: 'Failed to get authentication token' });
    }

    // Fetch medication catalog from Merlin API
    const response = await fetch(`https://uma-394.azurewebsites.net/api/v1/catalogs/get-medication-catalog`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    const medications = await response.json();
    
    if (!Array.isArray(medications)) {
      throw new Error('Invalid medication catalog format');
    }

    // Create medication_catalog table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS medication_catalog (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for fast searching
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_medication_name 
      ON medication_catalog USING GIN (to_tsvector('english', name))
    `);

    // Clear existing catalog and insert new medications
    await client.query('DELETE FROM medication_catalog');
    
    // Batch insert medications
    const batchSize = 100;
    
    for (let i = 0; i < medications.length; i += batchSize) {
      const batch = medications.slice(i, i + batchSize);
      const values = batch.map((med: string) => `('${med.replace(/'/g, "''")}')`).join(',');
      
      await client.query(`
        INSERT INTO medication_catalog (name)
        VALUES ${values}
        ON CONFLICT (name) DO NOTHING
      `);
    }

    // Get final count
    const countResult = await client.query('SELECT COUNT(*) as count FROM medication_catalog');
    const finalCount = countResult.rows[0].count;

    res.status(200).json({
      success: true,
      message: `Medication catalog populated successfully`,
      total_medications: finalCount,
      processed: medications.length
    });

  } catch (error) {
    console.error('Error populating medication catalog:', error);
    res.status(500).json({ 
      error: 'Failed to populate medication catalog',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    client.release();
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}