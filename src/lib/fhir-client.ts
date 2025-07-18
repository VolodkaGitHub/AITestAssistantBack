/**
 * FHIR Client - Basic FHIR R4 client for healthcare data interoperability
 * Provides backward compatibility for existing imports
 */

import { DatabasePool } from './database-pool';

interface FHIRResource {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    profile?: string[];
  };
  [key: string]: any;
}

interface FHIRObservation extends FHIRResource {
  resourceType: 'Observation';
  status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: {
    coding: {
      system: string;
      code: string;
      display: string;
    }[];
  }[];
  code: {
    coding: {
      system: string;
      code: string;
      display: string;
    }[];
    text?: string;
  };
  subject: {
    reference: string;
  };
  valueQuantity?: {
    value: number;
    unit: string;
    system: string;
    code: string;
  };
  valueString?: string;
  valueCodeableConcept?: {
    coding: {
      system: string;
      code: string;
      display: string;
    }[];
    text?: string;
  };
  effectiveDateTime?: string;
  issued?: string;
}

interface FHIRPatient extends FHIRResource {
  resourceType: 'Patient';
  name?: {
    use?: string;
    family?: string;
    given?: string[];
    prefix?: string[];
    suffix?: string[];
  }[];
  telecom?: {
    system: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
    value: string;
    use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
  }[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  address?: {
    use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }[];
}

class FHIRClient {
  private dbPool: DatabasePool;

  constructor() {
    this.dbPool = DatabasePool.getInstance();
  }

  // Convert lab results to FHIR Observation format
  async getObservationsForPatient(patientId: string): Promise<FHIRObservation[]> {
    const client = await DatabasePool.getClient();
    try {
      const result = await client.query(
        `SELECT * FROM lab_results WHERE user_email = $1 ORDER BY test_date DESC`,
        [patientId]
      );

      return result.rows.map(row => this.convertLabResultToObservation(row, patientId));
    } catch (error) {
      console.error('Error fetching FHIR observations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Convert patient data to FHIR Patient format
  async getPatient(patientId: string): Promise<FHIRPatient | null> {
    const client = await DatabasePool.getClient();
    try {
      const result = await client.query(
        `SELECT * FROM users WHERE email = $1`,
        [patientId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return this.convertUserToPatient(user);
    } catch (error) {
      console.error('Error fetching FHIR patient:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Create a new FHIR Observation
  async createObservation(observation: Partial<FHIRObservation>): Promise<FHIRObservation> {
    const client = await DatabasePool.getClient();
    try {
      // Convert FHIR observation to lab result format and store
      const labResult = this.convertObservationToLabResult(observation);
      
      const result = await client.query(
        `INSERT INTO lab_results (user_email, test_name, test_value, test_unit, test_date, reference_range, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          labResult.user_email,
          labResult.test_name,
          labResult.test_value,
          labResult.test_unit,
          labResult.test_date,
          labResult.reference_range,
          labResult.status
        ]
      );

      return this.convertLabResultToObservation(result.rows[0], labResult.user_email);
    } catch (error) {
      console.error('Error creating FHIR observation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private convertLabResultToObservation(labResult: any, patientId: string): FHIRObservation {
    return {
      resourceType: 'Observation',
      id: labResult.id?.toString(),
      status: labResult.status || 'final',
      category: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'laboratory',
          display: 'Laboratory'
        }]
      }],
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: labResult.loinc_code || 'unknown',
          display: labResult.test_name
        }],
        text: labResult.test_name
      },
      subject: {
        reference: `Patient/${patientId}`
      },
      valueQuantity: labResult.test_value ? {
        value: parseFloat(labResult.test_value),
        unit: labResult.test_unit || '',
        system: 'http://unitsofmeasure.org',
        code: labResult.test_unit || ''
      } : undefined,
      valueString: typeof labResult.test_value === 'string' ? labResult.test_value : undefined,
      effectiveDateTime: labResult.test_date,
      issued: labResult.created_at
    };
  }

  private convertUserToPatient(user: any): FHIRPatient {
    return {
      resourceType: 'Patient',
      id: user.email,
      name: [{
        use: 'official',
        given: user.first_name ? [user.first_name] : [],
        family: user.last_name || ''
      }],
      telecom: [{
        system: 'email',
        value: user.email,
        use: 'home'
      }],
      gender: user.gender?.toLowerCase() || 'unknown',
      birthDate: user.date_of_birth
    };
  }

  private convertObservationToLabResult(observation: Partial<FHIRObservation>): any {
    return {
      user_email: observation.subject?.reference.replace('Patient/', '') || '',
      test_name: observation.code?.text || observation.code?.coding?.[0]?.display || '',
      test_value: observation.valueQuantity?.value?.toString() || observation.valueString || '',
      test_unit: observation.valueQuantity?.unit || '',
      test_date: observation.effectiveDateTime || new Date().toISOString(),
      reference_range: '',
      status: observation.status || 'final'
    };
  }

  // Get all resources for a patient
  async getPatientEverything(patientId: string): Promise<{ patient: FHIRPatient | null; observations: FHIRObservation[] }> {
    const [patient, observations] = await Promise.all([
      this.getPatient(patientId),
      this.getObservationsForPatient(patientId)
    ]);

    return { patient, observations };
  }
}

// Create a singleton instance for backward compatibility
export const fhirClient = new FHIRClient();

// Export the class and types for direct use
export { FHIRClient };
export type { FHIRResource, FHIRObservation, FHIRPatient };