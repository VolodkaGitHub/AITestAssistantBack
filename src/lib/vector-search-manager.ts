/**
 * Vector Search Manager
 * Ensures SDCO database is always populated and ready for use
 */

import { Pool } from 'pg'

export class VectorSearchManager {
  private pool: Pool
  private isInitialized: boolean = false
  private lastPopulationCheck: Date | null = null
  private readonly POPULATION_CHECK_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    })
  }

  /**
   * Ensure vector search database is ready for use
   */
  async ensureVectorSearchReady(): Promise<boolean> {
    try {
      // Check if initialization is needed
      if (!this.isInitialized || this.needsPopulationCheck()) {
        await this.initializeIfNeeded()
        await this.populateIfNeeded()
        this.isInitialized = true
        this.lastPopulationCheck = new Date()
      }
      
      return true
    } catch (error) {
      console.warn('Vector search initialization failed, falling back to basic search:', error)
      return false
    }
  }

  /**
   * Check if database table exists and has minimum required documents
   */
  private async isDatabaseReady(): Promise<{ exists: boolean; documentCount: number }> {
    const client = await this.pool.connect()
    
    try {
      // Check if table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'sdco_documents'
        )
      `)
      
      if (!tableCheck.rows[0].exists) {
        return { exists: false, documentCount: 0 }
      }

      // Check document count
      const countResult = await client.query('SELECT COUNT(*) FROM sdco_documents')
      const documentCount = parseInt(countResult.rows[0].count)
      
      return { exists: true, documentCount }
    } catch (error) {
      console.warn('Database readiness check failed:', error)
      return { exists: false, documentCount: 0 }
    } finally {
      client.release()
    }
  }

  /**
   * Initialize database schema if needed
   */
  private async initializeIfNeeded(): Promise<void> {
    const { exists } = await this.isDatabaseReady()
    
    if (!exists) {
      console.log('Initializing enhanced SDCO document storage...')
      await this.initializeDatabase()
    }
  }

  /**
   * Populate database with test/sample documents if empty
   */
  private async populateIfNeeded(): Promise<void> {
    const { documentCount } = await this.isDatabaseReady()
    
    if (documentCount === 0) {
      console.log('Populating vector search database with sample SDCO documents...')
      await this.populateWithSampleDocuments()
    }
  }

  /**
   * Initialize database schema - uses existing sdco_documents table
   */
  private async initializeDatabase(): Promise<void> {
    const client = await this.pool.connect()
    
    try {
      // Ensure the existing sdco_documents table has proper vector search capabilities
      await client.query(`
        -- Table already exists with 942 documents, just ensure search indexes
        CREATE INDEX IF NOT EXISTS idx_sdco_vector_search 
        ON sdco_documents USING GIN(vector_search);
        
        CREATE INDEX IF NOT EXISTS idx_sdco_body_system 
        ON sdco_documents(body_system);
        
        CREATE INDEX IF NOT EXISTS idx_sdco_display_name 
        ON sdco_documents(display_name);
          when_to_seek_care JSONB DEFAULT '[]',
          related_conditions JSONB DEFAULT '[]',
          full_content_text TEXT,
          content_tsvector tsvector,
          document_raw JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_enhanced_sdco_content_tsvector 
        ON enhanced_sdco_documents USING GIN(content_tsvector)
      `)
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_enhanced_sdco_body_system 
        ON enhanced_sdco_documents(body_system)
      `)

      // Create tsvector update function
      await client.query(`
        CREATE OR REPLACE FUNCTION update_enhanced_sdco_tsvector() RETURNS trigger AS $$
        BEGIN
          NEW.content_tsvector := to_tsvector('english', 
            COALESCE(NEW.display_name, '') || ' ' ||
            COALESCE(NEW.display_name_layman, '') || ' ' ||
            COALESCE(NEW.description, '') || ' ' ||
            COALESCE(NEW.definition, '') || ' ' ||
            COALESCE(NEW.definition_layman, '') || ' ' ||
            COALESCE(NEW.full_content_text, '')
          );
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `)

      // Create trigger
      await client.query(`
        DROP TRIGGER IF EXISTS trigger_enhanced_sdco_tsvector ON enhanced_sdco_documents;
        CREATE TRIGGER trigger_enhanced_sdco_tsvector 
        BEFORE INSERT OR UPDATE ON enhanced_sdco_documents
        FOR EACH ROW EXECUTE FUNCTION update_enhanced_sdco_tsvector();
      `)

      console.log('Enhanced SDCO document storage initialized successfully')
    } finally {
      client.release()
    }
  }

  /**
   * Populate with comprehensive sample SDCO documents
   */
  private async populateWithSampleDocuments(): Promise<void> {
    const client = await this.pool.connect()
    
    try {
      const sampleDocuments = [
        {
          sdco_id: 'headache@C0018681',
          display_name: 'Headache',
          display_name_layman: 'Head Pain',
          description: 'Pain in the head or upper neck region',
          definition: 'Headache is pain in any region of the head',
          definition_layman: 'Pain felt anywhere in the head',
          categories: ['Neurological', 'Pain'],
          body_system: 'neurological',
          symptoms: ['throbbing pain', 'pressure sensation', 'sensitivity to light', 'nausea', 'dizziness'],
          treatments: ['rest in dark room', 'over-the-counter pain relievers', 'hydration', 'cold compress'],
          risk_factors: ['stress', 'dehydration', 'lack of sleep', 'eye strain', 'hormonal changes'],
          complications: ['chronic headache', 'medication overuse headache', 'impact on daily activities'],
          diagnostic_criteria: ['location of pain', 'duration', 'associated symptoms', 'triggers'],
          prevention_tips: ['regular sleep schedule', 'stress management', 'adequate hydration', 'limit screen time'],
          when_to_seek_care: ['sudden severe headache', 'headache with fever', 'vision changes', 'persistent headache'],
          related_conditions: ['migraine', 'tension headache', 'cluster headache', 'sinus headache'],
          full_content_text: 'headache head pain neurological throbbing pressure light sensitivity nausea stress dehydration sleep migraine tension'
        },
        {
          sdco_id: 'abdominal_pain@C0000737',
          display_name: 'Abdominal Pain',
          display_name_layman: 'Stomach Pain',
          description: 'Pain felt in the abdomen',
          definition: 'Discomfort in the abdominal region',
          definition_layman: 'Pain or discomfort in the belly area',
          categories: ['Gastrointestinal', 'Pain'],
          body_system: 'gastrointestinal',
          symptoms: ['cramping', 'sharp pain', 'bloating', 'nausea', 'loss of appetite'],
          treatments: ['dietary changes', 'antacids', 'rest', 'heat therapy', 'probiotics'],
          risk_factors: ['certain foods', 'stress', 'infections', 'medications', 'digestive disorders'],
          complications: ['dehydration', 'perforation if severe', 'chronic pain', 'nutritional deficiencies'],
          diagnostic_criteria: ['location', 'quality of pain', 'timing', 'associated symptoms'],
          prevention_tips: ['healthy diet', 'avoid trigger foods', 'regular meals', 'stress management'],
          when_to_seek_care: ['severe pain', 'persistent vomiting', 'signs of dehydration', 'blood in stool'],
          related_conditions: ['gastritis', 'appendicitis', 'IBS', 'GERD', 'peptic ulcer'],
          full_content_text: 'abdominal pain stomach belly gastrointestinal cramping bloating nausea diet stress gastritis appendicitis'
        },
        {
          sdco_id: 'runny_nose@C0231727',
          display_name: 'Rhinorrhea',
          display_name_layman: 'Runny Nose',
          description: 'Excess nasal discharge',
          definition: 'Flow of mucus from the nose',
          definition_layman: 'When mucus runs out of your nose',
          categories: ['Respiratory', 'ENT'],
          body_system: 'respiratory',
          symptoms: ['nasal discharge', 'congestion', 'sneezing', 'postnasal drip', 'itchy nose'],
          treatments: ['nasal decongestants', 'saline rinse', 'antihistamines', 'humidifier', 'rest'],
          risk_factors: ['allergies', 'viral infections', 'cold weather', 'irritants', 'dry air'],
          complications: ['sinusitis', 'ear infections', 'throat irritation', 'sleep disruption'],
          diagnostic_criteria: ['duration', 'color of discharge', 'associated symptoms', 'triggers'],
          prevention_tips: ['avoid allergens', 'hand hygiene', 'humidifier use', 'nasal irrigation'],
          when_to_seek_care: ['persistent symptoms', 'colored discharge', 'facial pain', 'fever'],
          related_conditions: ['allergic rhinitis', 'sinusitis', 'common cold', 'hay fever'],
          full_content_text: 'runny nose rhinorrhea nasal discharge mucus respiratory allergies congestion sneezing sinusitis cold'
        },
        {
          sdco_id: 'chest_pain@C0008031',
          display_name: 'Chest Pain',
          display_name_layman: 'Chest Pain',
          description: 'Discomfort in the chest area',
          definition: 'Pain or discomfort felt in the chest',
          definition_layman: 'Pain felt in the chest area',
          categories: ['Cardiovascular', 'Respiratory'],
          body_system: 'cardiovascular',
          symptoms: ['pressure', 'tightness', 'burning sensation', 'shortness of breath', 'radiating pain'],
          treatments: ['nitroglycerin if prescribed', 'rest', 'oxygen therapy', 'aspirin if appropriate'],
          risk_factors: ['heart disease', 'smoking', 'high blood pressure', 'diabetes', 'family history'],
          complications: ['heart attack', 'arrhythmia', 'cardiac arrest', 'pulmonary embolism'],
          diagnostic_criteria: ['character of pain', 'radiation', 'triggers', 'duration'],
          prevention_tips: ['heart-healthy diet', 'regular exercise', 'avoid smoking', 'stress management'],
          when_to_seek_care: ['crushing chest pain', 'pain with sweating', 'shortness of breath', 'radiating pain'],
          related_conditions: ['angina', 'myocardial infarction', 'costochondritis', 'GERD'],
          full_content_text: 'chest pain cardiovascular heart pressure tightness burning shortness breath cardiac angina heart attack'
        },
        {
          sdco_id: 'fatigue@C0015672',
          display_name: 'Fatigue',
          display_name_layman: 'Tiredness',
          description: 'Feeling of tiredness or exhaustion',
          definition: 'A subjective feeling of tiredness',
          definition_layman: 'Feeling very tired or worn out',
          categories: ['Constitutional', 'General'],
          body_system: 'general',
          symptoms: ['weakness', 'lack of energy', 'drowsiness', 'difficulty concentrating', 'muscle fatigue'],
          treatments: ['adequate rest', 'balanced nutrition', 'regular exercise', 'stress management'],
          risk_factors: ['poor sleep', 'stress', 'medical conditions', 'medications', 'lifestyle factors'],
          complications: ['decreased productivity', 'safety risks', 'mood changes', 'immune suppression'],
          diagnostic_criteria: ['duration', 'severity', 'impact on function', 'associated symptoms'],
          prevention_tips: ['good sleep hygiene', 'stress management', 'regular activity', 'healthy diet'],
          when_to_seek_care: ['persistent fatigue', 'unexplained weakness', 'other symptoms', 'impact on life'],
          related_conditions: ['chronic fatigue syndrome', 'depression', 'anemia', 'thyroid disorders'],
          full_content_text: 'fatigue tiredness exhaustion weakness energy sleep stress constitutional chronic syndrome depression'
        },
        {
          sdco_id: 'back_pain@C0004604',
          display_name: 'Back Pain',
          display_name_layman: 'Back Pain',
          description: 'Pain in the back region',
          definition: 'Discomfort in the dorsal region of the body',
          definition_layman: 'Pain felt in the back area',
          categories: ['Musculoskeletal', 'Pain'],
          body_system: 'musculoskeletal',
          symptoms: ['aching', 'stiffness', 'muscle spasms', 'radiating pain', 'limited mobility'],
          treatments: ['rest', 'physical therapy', 'pain relievers', 'heat/cold therapy', 'exercise'],
          risk_factors: ['poor posture', 'heavy lifting', 'age', 'sedentary lifestyle', 'obesity'],
          complications: ['chronic pain', 'disability', 'nerve damage', 'muscle weakness'],
          diagnostic_criteria: ['location', 'radiation pattern', 'triggers', 'duration'],
          prevention_tips: ['proper posture', 'regular exercise', 'ergonomic workspace', 'proper lifting'],
          when_to_seek_care: ['severe pain', 'numbness', 'weakness', 'bowel/bladder changes'],
          related_conditions: ['herniated disc', 'sciatica', 'muscle strain', 'spinal stenosis'],
          full_content_text: 'back pain musculoskeletal aching stiffness spasms posture lifting exercise sciatica disc'
        },
        {
          sdco_id: 'dizziness@C0012833',
          display_name: 'Dizziness',
          display_name_layman: 'Dizziness',
          description: 'Feeling of unsteadiness or lightheadedness',
          definition: 'Sensation of spinning or loss of balance',
          definition_layman: 'Feeling dizzy or off-balance',
          categories: ['Neurological', 'Vestibular'],
          body_system: 'neurological',
          symptoms: ['lightheadedness', 'vertigo', 'imbalance', 'nausea', 'visual disturbance'],
          treatments: ['rest', 'hydration', 'vestibular exercises', 'medication if prescribed'],
          risk_factors: ['dehydration', 'medications', 'inner ear problems', 'blood pressure changes'],
          complications: ['falls', 'injury', 'persistent vertigo', 'motion sickness'],
          diagnostic_criteria: ['type of dizziness', 'triggers', 'duration', 'associated symptoms'],
          prevention_tips: ['stay hydrated', 'slow position changes', 'avoid triggers', 'balance exercises'],
          when_to_seek_care: ['persistent dizziness', 'hearing loss', 'severe headache', 'confusion'],
          related_conditions: ['vertigo', 'Meniere disease', 'BPPV', 'vestibular neuritis'],
          full_content_text: 'dizziness lightheadedness vertigo balance nausea neurological vestibular dehydration inner ear'
        }
      ]

      let insertedCount = 0

      for (const doc of sampleDocuments) {
        await client.query(`
          INSERT INTO enhanced_sdco_documents (
            sdco_id, display_name, display_name_layman, description,
            definition, definition_layman, categories, body_system,
            symptoms, treatments, risk_factors, complications,
            diagnostic_criteria, prevention_tips, when_to_seek_care,
            related_conditions, full_content_text
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (sdco_id) DO NOTHING
        `, [
          doc.sdco_id,
          doc.display_name,
          doc.display_name_layman,
          doc.description,
          doc.definition,
          doc.definition_layman,
          JSON.stringify(doc.categories),
          doc.body_system,
          JSON.stringify(doc.symptoms),
          JSON.stringify(doc.treatments),
          JSON.stringify(doc.risk_factors),
          JSON.stringify(doc.complications),
          JSON.stringify(doc.diagnostic_criteria),
          JSON.stringify(doc.prevention_tips),
          JSON.stringify(doc.when_to_seek_care),
          JSON.stringify(doc.related_conditions),
          doc.full_content_text
        ])
        
        insertedCount++
      }

      console.log(`Sample SDCO documents populated successfully. Inserted: ${insertedCount}`)
    } finally {
      client.release()
    }
  }

  /**
   * Check if we need to verify population status
   */
  private needsPopulationCheck(): boolean {
    if (!this.lastPopulationCheck) return true
    
    const timeSinceCheck = Date.now() - this.lastPopulationCheck.getTime()
    return timeSinceCheck > this.POPULATION_CHECK_INTERVAL
  }

  /**
   * Get current database statistics
   */
  async getDatabaseStats(): Promise<{ documentCount: number; isReady: boolean }> {
    const { exists, documentCount } = await this.isDatabaseReady()
    return {
      documentCount,
      isReady: exists && documentCount > 0
    }
  }
}