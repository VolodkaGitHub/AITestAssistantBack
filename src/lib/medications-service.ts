import { DatabasePool } from './database-pool';

export interface MedicationData {
  id: string
  name: string
  dosage: string | null
  frequency: string | null
  status: string
  start_date: string | null
  end_date: string | null
  prescribing_doctor: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MedicationSummary {
  total: number
  active: number
  inactive: number
}

export interface MedicationsResponse {
  medications: MedicationData[]
  summary: MedicationSummary
}

/**
 * Core medications service - shared logic for both user's own data and linked account data
 */
export class MedicationsService {
  
  /**
   * Fetch medications for any user ID
   * This is the core logic that both APIs will use
   */
  static async getMedicationsForUser(userId: string): Promise<MedicationsResponse> {
    const medicationsQuery = `
      SELECT 
        id,
        name,
        dosage,
        frequency,
        status,
        start_date,
        end_date,
        prescribing_doctor,
        notes,
        created_at,
        updated_at
      FROM user_medications 
      WHERE user_id = $1 
      ORDER BY 
        CASE WHEN status = 'active' THEN 1 ELSE 2 END,
        created_at DESC
    `
    
    const client = await DatabasePool.getClient()
    let medicationsResult
    try {
      medicationsResult = await client.query(medicationsQuery, [userId])
    } finally {
      client.release()
    }

    // Get medication summary
    const activeMeds = medicationsResult.rows.filter(med => med.status === 'active')
    const inactiveMeds = medicationsResult.rows.filter(med => med.status !== 'active')

    return {
      medications: medicationsResult.rows,
      summary: {
        total: medicationsResult.rows.length,
        active: activeMeds.length,
        inactive: inactiveMeds.length
      }
    }
  }

  /**
   * Create a summary text for AI consumption
   */
  static createMedicationSummary(medications: MedicationData[], userEmail: string): string {
    const activeMeds = medications.filter(med => med.status === 'active')
    
    if (activeMeds.length > 0) {
      const medicationNames = activeMeds.map(med => `${med.name} ${med.dosage || ''}`.trim()).join(', ')
      return `${userEmail} is currently taking ${activeMeds.length} medication${activeMeds.length > 1 ? 's' : ''}: ${medicationNames}`
    } else {
      return `${userEmail} has no active medications on record`
    }
  }

  /**
   * Add any custom business logic here that should apply to both APIs
   * For example: filtering, sorting, data transformations, etc.
   */
  static applyBusinessLogic(medications: MedicationData[]): MedicationData[] {
    // Example: You could add logic here to:
    // - Filter out sensitive medications
    // - Add calculated fields
    // - Apply privacy rules
    // - Sort by priority
    
    return medications
  }
}