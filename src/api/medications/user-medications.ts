import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DatabasePool } from '../../lib/database-pool';
import { authDB } from '../../lib/auth-database';

export interface UserMedication {
  id?: string;
  user_id: string;
  name: string;
  dosage?: string;
  frequency?: string;
  start_date?: string;
  end_date?: string;
  status: string;
  prescribing_doctor?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const client = await DatabasePool.getClient();

  try {
    // The user_medications table is already created by the health database setup
    // with the correct schema: name, status, start_date, end_date, prescribing_doctor
    // No need to create a different table here

    // Create index for fast user lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_medications_user_id 
      ON user_medications (user_id)
    `);

    // Get session token from headers
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify session and get user
    const user = await authDB.validateSession(sessionToken);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    switch (req.method) {
      case 'GET':
        return await getUserMedications(client, user.id, res);
      case 'POST':
        return await addUserMedication(client, user.id, req.body, res);
      case 'PUT':
        return await updateUserMedication(client, user.id, req.body, res);
      case 'DELETE':
        return await deleteUserMedication(client, user.id, req.query.id as string, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Error in user medications API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    client.release();
  }
}

async function getUserMedications(client: any, userId: string, res: NextApiResponse) {
  const result = await client.query(`
    SELECT * FROM user_medications 
    WHERE user_id = $1 
    ORDER BY 
      CASE WHEN status = 'active' THEN 1 ELSE 2 END,
      start_date DESC NULLS LAST,
      name ASC
  `, [userId]);

  res.status(200).json({
    success: true,
    medications: result.rows
  });
}

async function addUserMedication(client: any, userId: string, medicationData: any, res: NextApiResponse) {
  const {
    name,
    medication_name, // Support both old and new field names
    dosage,
    frequency,
    start_date,
    date_started, // Support old field name
    end_date,
    date_ended, // Support old field name
    status = 'active',
    currently_taking = true, // Support old field name
    prescribing_doctor,
    notes
  } = medicationData;

  // Use new field name or fall back to old field name
  const medicationName = name || medication_name;
  const startDate = start_date || date_started;
  const endDate = end_date || date_ended;
  const medicationStatus = status || (currently_taking ? 'active' : 'inactive');

  if (!medicationName) {
    return res.status(400).json({ error: 'Medication name is required' });
  }

  const result = await client.query(`
    INSERT INTO user_medications (
      user_id, name, dosage, frequency, 
      start_date, end_date, status, prescribing_doctor, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    userId,
    medicationName,
    dosage || null,
    frequency || null,
    startDate || null,
    endDate || null,
    medicationStatus,
    prescribing_doctor || null,
    notes || null
  ]);

  res.status(201).json({
    success: true,
    medication: result.rows[0],
    message: 'Medication added successfully'
  });
}

async function updateUserMedication(client: any, userId: string, medicationData: UserMedication, res: NextApiResponse) {
  const {
    id,
    medication_name: medicationName,
    dosage,
    frequency,
    date_started: dateStarted,
    date_ended: dateEnded,
    currently_taking: currentlyTaking,
    notes
  } = medicationData as any;

  if (!id) {
    return res.status(400).json({ error: 'Medication ID is required for updates' });
  }

  const result = await client.query(`
    UPDATE user_medications 
    SET 
      name = $3,
      dosage = $4,
      frequency = $5,
      start_date = $6,
      end_date = $7,
      status = $8,
      notes = $9,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `, [
    id,
    userId,
    medicationName,
    dosage || null,
    frequency || null,
    dateStarted || null,
    dateEnded || null,
    currentlyTaking ? 'active' : 'inactive',
    notes || null
  ]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Medication not found or access denied' });
  }

  res.status(200).json({
    success: true,
    medication: result.rows[0],
    message: 'Medication updated successfully'
  });
}

async function deleteUserMedication(client: any, userId: string, medicationId: string, res: NextApiResponse) {
  if (!medicationId) {
    return res.status(400).json({ error: 'Medication ID is required' });
  }

  const result = await client.query(`
    DELETE FROM user_medications 
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `, [medicationId, userId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Medication not found or access denied' });
  }

  res.status(200).json({
    success: true,
    message: 'Medication deleted successfully'
  });
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}