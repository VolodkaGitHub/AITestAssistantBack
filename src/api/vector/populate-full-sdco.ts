import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';

const dbPool = DatabasePool.getInstance()

async function getJWTToken(): Promise<string> {
  const response = await fetch(`${process.env.NEXTAUTH_URL || 'https://treatmentglm.replit.app'}/api/auth/jwt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`JWT token request failed: ${response.status}`)
  }

  const data = await response.json()
  return data.access_token
}

async function fetchSDCOHeaders(jwtToken: string): Promise<any[]> {
  const response = await fetch('https://merlin-394631772515.us-central1.run.app/api/v1/diagnostic/get-platform-sdco-headers', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      platform_id: 'Mobile'
    })
  })

  if (!response.ok) {
    throw new Error(`SDCO headers API request failed: ${response.status}`)
  }

  const data = await response.json()
  return data.documents || []
}

async function fetchFullSDCODocument(jwtToken: string, sdcoId: string): Promise<any> {
  const response = await fetch('https://merlin-394631772515.us-central1.run.app/api/v1/diagnostic/get-one-sdco', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      platform_id: 'Mobile',
      sdco_id: sdcoId
    })
  })

  if (!response.ok) {
    console.warn(`Failed to fetch SDCO document ${sdcoId}: ${response.status}`)
    return null
  }

  const data = await response.json()
  return data.document || null
}

function extractComprehensiveContent(document: any): {
  symptoms: string[]
  treatments: string[]
  riskFactors: string[]
  complications: string[]
  diagnosticCriteria: string[]
  preventionTips: string[]
  whenToSeekCare: string[]
  relatedConditions: string[]
  fullContentText: string
} {
  const symptoms: string[] = []
  const treatments: string[] = []
  const riskFactors: string[] = []
  const complications: string[] = []
  const diagnosticCriteria: string[] = []
  const preventionTips: string[] = []
  const whenToSeekCare: string[] = []
  const relatedConditions: string[] = []

  // Extract symptoms from branches and modifiers
  if (document.branches) {
    document.branches.forEach((branch: any) => {
      if (branch.display_name) symptoms.push(branch.display_name)
      if (branch.question) symptoms.push(branch.question)
    })
  }

  if (document.modifiers) {
    document.modifiers.forEach((modifier: any) => {
      if (modifier.display_name) symptoms.push(modifier.display_name)
    })
  }

  // Extract related conditions from branches
  if (document.branches) {
    document.branches.forEach((branch: any) => {
      if (branch.display_name && branch.item_id) {
        relatedConditions.push(`${branch.display_name} (${branch.item_id})`)
      }
    })
  }

  // Extract diagnostic criteria from categories and diagnostic codes
  if (document.categories) {
    document.categories.forEach((category: any) => {
      if (category.values) {
        diagnosticCriteria.push(...category.values)
      }
    })
  }

  if (document.default_diagnostic_code) {
    diagnosticCriteria.push(`${document.default_diagnostic_code.coding_system}: ${document.default_diagnostic_code.code}`)
  }

  // Build comprehensive full-text content
  const contentParts = [
    document.display_name || '',
    document.display_name_layman || '',
    document.description || '',
    document.definition || '',
    document.definition_layman || '',
    document.question || '',
    ...symptoms,
    ...relatedConditions,
    ...diagnosticCriteria
  ]

  // Add citation content for search
  if (document.citations) {
    contentParts.push(...document.citations)
  }

  // Add category information
  if (document.categories) {
    document.categories.forEach((category: any) => {
      contentParts.push(category.category || '')
      if (category.values) {
        contentParts.push(...category.values)
      }
    })
  }

  const fullContentText = contentParts
    .filter(part => part && typeof part === 'string' && part.length > 0)
    .join(' ')

  return {
    symptoms,
    treatments,
    riskFactors,
    complications,
    diagnosticCriteria,
    preventionTips,
    whenToSeekCare,
    relatedConditions,
    fullContentText
  }
}

function determineBodySystem(displayName: string, categories: any[]): string {
  const name = displayName.toLowerCase()
  
  // Check categories first
  if (categories) {
    for (const category of categories) {
      if (category.category) {
        const catName = category.category.toLowerCase()
        if (catName.includes('respiratory') || catName.includes('pulmonary')) return 'respiratory'
        if (catName.includes('cardiac') || catName.includes('cardiovascular')) return 'cardiovascular'
        if (catName.includes('gastrointestinal') || catName.includes('digestive')) return 'gastrointestinal'
        if (catName.includes('neurological') || catName.includes('nervous')) return 'neurological'
        if (catName.includes('musculoskeletal') || catName.includes('orthopedic')) return 'musculoskeletal'
        if (catName.includes('dermatological') || catName.includes('skin')) return 'dermatological'
        if (catName.includes('hematological') || catName.includes('blood')) return 'hematological'
        if (catName.includes('endocrine') || catName.includes('hormone')) return 'endocrine'
        if (catName.includes('genitourinary') || catName.includes('urological')) return 'genitourinary'
        if (catName.includes('ophthalmological') || catName.includes('eye')) return 'ophthalmological'
        if (catName.includes('otolaryngological') || catName.includes('ear')) return 'otolaryngological'
      }
    }
  }
  
  // Fallback to display name analysis
  if (name.includes('respiratory') || name.includes('lung') || name.includes('breathing') || name.includes('cough') || name.includes('nose') || name.includes('sinus')) return 'respiratory'
  if (name.includes('cardiac') || name.includes('heart') || name.includes('cardiovascular') || name.includes('chest pain')) return 'cardiovascular'
  if (name.includes('gastrointestinal') || name.includes('stomach') || name.includes('intestinal') || name.includes('abdominal') || name.includes('nausea')) return 'gastrointestinal'
  if (name.includes('neurological') || name.includes('brain') || name.includes('nervous') || name.includes('headache') || name.includes('migraine')) return 'neurological'
  if (name.includes('musculoskeletal') || name.includes('muscle') || name.includes('bone') || name.includes('joint') || name.includes('back pain')) return 'musculoskeletal'
  if (name.includes('dermatological') || name.includes('skin') || name.includes('rash')) return 'dermatological'
  if (name.includes('hematological') || name.includes('blood') || name.includes('bleeding')) return 'hematological'
  if (name.includes('endocrine') || name.includes('hormone') || name.includes('diabetes')) return 'endocrine'
  if (name.includes('genitourinary') || name.includes('kidney') || name.includes('urinary') || name.includes('bladder')) return 'genitourinary'
  if (name.includes('eye') || name.includes('vision') || name.includes('visual')) return 'ophthalmological'
  if (name.includes('ear') || name.includes('hearing') || name.includes('tinnitus')) return 'otolaryngological'
  
  return 'general'
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { limit } = req.body // Optional limit for testing
  const client = await DatabasePool.getClient()
  
  try {
    console.log('Starting comprehensive SDCO document population...')
    
    // Initialize enhanced table with comprehensive fields
    await client.query(`
      CREATE TABLE IF NOT EXISTS enhanced_sdco_documents (
        id SERIAL PRIMARY KEY,
        sdco_id VARCHAR(255) UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        display_name_layman TEXT,
        description TEXT,
        definition TEXT,
        definition_layman TEXT,
        categories JSONB DEFAULT '[]',
        body_system VARCHAR(100),
        symptoms JSONB DEFAULT '[]',
        treatments JSONB DEFAULT '[]',
        risk_factors JSONB DEFAULT '[]',
        complications JSONB DEFAULT '[]',
        diagnostic_criteria JSONB DEFAULT '[]',
        prevention_tips JSONB DEFAULT '[]',
        when_to_seek_care JSONB DEFAULT '[]',
        related_conditions JSONB DEFAULT '[]',
        full_content_text TEXT,
        content_tsvector tsvector,
        document_raw JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create comprehensive indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_enhanced_sdco_content_tsvector 
      ON enhanced_sdco_documents USING GIN(content_tsvector)
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_enhanced_sdco_body_system 
      ON enhanced_sdco_documents(body_system)
    `)
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_enhanced_sdco_symptoms 
      ON enhanced_sdco_documents USING GIN(symptoms)
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

    // Get JWT token
    const jwtToken = await getJWTToken()
    console.log('JWT token obtained successfully')

    // Fetch all SDCO headers first
    const sdcoHeaders = await fetchSDCOHeaders(jwtToken)
    console.log(`Found ${sdcoHeaders.length} SDCO headers`)

    const sdcosToProcess = limit ? sdcoHeaders.slice(0, limit) : sdcoHeaders
    console.log(`Processing ${sdcosToProcess.length} SDCO documents...`)

    let processedCount = 0
    let errorCount = 0
    let enrichedCount = 0

    // Process each SDCO document
    for (const header of sdcosToProcess) {
      try {
        console.log(`Processing ${processedCount + 1}/${sdcosToProcess.length}: ${header.id}`)
        
        // Fetch full SDCO document
        const fullDocument = await fetchFullSDCODocument(jwtToken, header.id)
        
        if (fullDocument) {
          // Extract comprehensive content
          const extractedContent = extractComprehensiveContent(fullDocument)
          const bodySystem = determineBodySystem(fullDocument.display_name, fullDocument.categories)
          
          // Store in database
          await client.query(`
            INSERT INTO enhanced_sdco_documents (
              sdco_id, display_name, display_name_layman, description,
              definition, definition_layman, categories, body_system,
              symptoms, treatments, risk_factors, complications,
              diagnostic_criteria, prevention_tips, when_to_seek_care,
              related_conditions, full_content_text, document_raw
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (sdco_id) DO UPDATE SET
              display_name = EXCLUDED.display_name,
              display_name_layman = EXCLUDED.display_name_layman,
              description = EXCLUDED.description,
              definition = EXCLUDED.definition,
              definition_layman = EXCLUDED.definition_layman,
              categories = EXCLUDED.categories,
              body_system = EXCLUDED.body_system,
              symptoms = EXCLUDED.symptoms,
              treatments = EXCLUDED.treatments,
              risk_factors = EXCLUDED.risk_factors,
              complications = EXCLUDED.complications,
              diagnostic_criteria = EXCLUDED.diagnostic_criteria,
              prevention_tips = EXCLUDED.prevention_tips,
              when_to_seek_care = EXCLUDED.when_to_seek_care,
              related_conditions = EXCLUDED.related_conditions,
              full_content_text = EXCLUDED.full_content_text,
              document_raw = EXCLUDED.document_raw,
              updated_at = CURRENT_TIMESTAMP
          `, [
            header.id,
            fullDocument.display_name || header.display_name || '',
            fullDocument.display_name_layman || header.display_name_layman || '',
            fullDocument.description || header.description || '',
            fullDocument.definition || '',
            fullDocument.definition_layman || '',
            JSON.stringify(fullDocument.categories || header.categories || []),
            bodySystem,
            JSON.stringify(extractedContent.symptoms),
            JSON.stringify(extractedContent.treatments),
            JSON.stringify(extractedContent.riskFactors),
            JSON.stringify(extractedContent.complications),
            JSON.stringify(extractedContent.diagnosticCriteria),
            JSON.stringify(extractedContent.preventionTips),
            JSON.stringify(extractedContent.whenToSeekCare),
            JSON.stringify(extractedContent.relatedConditions),
            extractedContent.fullContentText,
            JSON.stringify(fullDocument)
          ])
          
          enrichedCount++
        } else {
          // Store basic header information if full document unavailable
          await client.query(`
            INSERT INTO enhanced_sdco_documents (
              sdco_id, display_name, display_name_layman, description,
              categories, body_system, full_content_text
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (sdco_id) DO NOTHING
          `, [
            header.id,
            header.display_name || '',
            header.display_name_layman || '',
            header.description || '',
            JSON.stringify(header.categories || []),
            determineBodySystem(header.display_name, header.categories),
            `${header.display_name} ${header.display_name_layman} ${header.description}`.trim()
          ])
        }
        
        processedCount++
        
        if (processedCount % 25 === 0) {
          console.log(`Progress: ${processedCount}/${sdcosToProcess.length} (${enrichedCount} enriched)`)
        }
        
        // Add small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 50))
        
      } catch (error) {
        console.error(`Error processing SDCO ${header.id}:`, error)
        errorCount++
      }
    }

    // Get final statistics
    const countResult = await client.query('SELECT COUNT(*) as total, COUNT(document_raw) as enriched FROM enhanced_sdco_documents WHERE document_raw IS NOT NULL')
    const stats = countResult.rows[0]

    console.log(`Comprehensive SDCO population completed:`)
    console.log(`- Processed: ${processedCount}`)
    console.log(`- Enriched with full documents: ${enrichedCount}`)
    console.log(`- Errors: ${errorCount}`)
    console.log(`- Total in database: ${stats.total}`)
    console.log(`- Total enriched documents: ${stats.enriched}`)
    
    return res.status(200).json({
      success: true,
      message: 'Comprehensive SDCO documents populated successfully',
      statistics: {
        processed_count: processedCount,
        enriched_count: enrichedCount,
        error_count: errorCount,
        total_documents: parseInt(stats.total),
        enriched_documents: parseInt(stats.enriched)
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Error in comprehensive SDCO population:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to populate comprehensive SDCO documents',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  } finally {
    client.release()
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}