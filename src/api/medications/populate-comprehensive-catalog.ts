import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';

import { DatabasePool } from '../../lib/database-pool';

// Comprehensive medication list based on commonly prescribed medications
const COMPREHENSIVE_MEDICATIONS = [
  // Cardiovascular
  "Amlodipine", "Atenolol", "Carvedilol", "Diltiazem", "Enalapril", "Hydrochlorothiazide", "Lisinopril", 
  "Losartan", "Metoprolol", "Nifedipine", "Ramipril", "Simvastatin", "Atorvastatin", "Rosuvastatin",
  "Clopidogrel", "Warfarin", "Apixaban", "Rivaroxaban", "Digoxin", "Furosemide", "Spironolactone",
  
  // Endocrine/Diabetes
  "Metformin", "Glipizide", "Glyburide", "Insulin", "Januvia", "Jardiance", "Trulicity", "Ozempic",
  "Levothyroxine", "Synthroid", "Cytomel", "Prednisone", "Prednisolone", "Hydrocortisone",
  
  // Gastrointestinal
  "Omeprazole", "Lansoprazole", "Pantoprazole", "Ranitidine", "Famotidine", "Metoclopramide",
  "Ondansetron", "Loperamide", "Bisacodyl", "Psyllium", "Sucralfate", "Misoprostol",
  
  // Respiratory
  "Albuterol", "Ipratropium", "Budesonide", "Fluticasone", "Montelukast", "Theophylline",
  "Guaifenesin", "Dextromethorphan", "Codeine", "Benzonatate", "Cromolyn", "Tiotropium",
  
  // Neurological/Psychiatric
  "Sertraline", "Fluoxetine", "Paroxetine", "Citalopram", "Escitalopram", "Venlafaxine",
  "Duloxetine", "Amitriptyline", "Nortriptyline", "Trazodone", "Bupropion", "Mirtazapine",
  "Alprazolam", "Lorazepam", "Clonazepam", "Diazepam", "Zolpidem", "Eszopiclone",
  "Gabapentin", "Pregabalin", "Phenytoin", "Carbamazepine", "Valproic Acid", "Lamotrigine",
  "Levetiracetam", "Topiramate", "Lithium", "Quetiapine", "Risperidone", "Aripiprazole",
  "Olanzapine", "Haloperidol", "Chlorpromazine", "Donepezil", "Memantine", "Rivastigmine",
  
  // Pain/Inflammation
  "Acetaminophen", "Ibuprofen", "Naproxen", "Aspirin", "Celecoxib", "Indomethacin",
  "Tramadol", "Hydrocodone", "Oxycodone", "Morphine", "Fentanyl", "Codeine",
  "Lidocaine", "Capsaicin", "Menthol", "Diclofenac", "Meloxicam", "Piroxicam",
  
  // Infectious Disease
  "Amoxicillin", "Azithromycin", "Doxycycline", "Ciprofloxacin", "Levofloxacin", "Cephalexin",
  "Clindamycin", "Metronidazole", "Sulfamethoxazole", "Nitrofurantoin", "Vancomycin",
  "Acyclovir", "Valacyclovir", "Oseltamivir", "Fluconazole", "Nystatin", "Terbinafine",
  
  // Dermatological
  "Hydrocortisone", "Triamcinolone", "Betamethasone", "Clobetasol", "Tretinoin", "Adapalene",
  "Benzoyl Peroxide", "Clindamycin", "Erythromycin", "Tacrolimus", "Pimecrolimus",
  "Calcipotriene", "Coal Tar", "Selenium Sulfide", "Ketoconazole", "Mupirocin",
  
  // Genitourinary
  "Tamsulosin", "Finasteride", "Dutasteride", "Oxybutynin", "Tolterodine", "Solifenacin",
  "Mirabegron", "Phenazopyridine", "Nitrofurantoin", "Ciprofloxacin", "Doxazosin",
  
  // Ophthalmologic
  "Timolol", "Latanoprost", "Brimonidine", "Dorzolamide", "Cyclopentolate", "Tropicamide",
  "Prednisolone", "Tobramycin", "Erythromycin", "Artificial Tears", "Cyclosporine",
  
  // Hematologic
  "Iron Sulfate", "Ferrous Gluconate", "Folic Acid", "Cyanocobalamin", "Epoetin Alfa",
  "Enoxaparin", "Heparin", "Clopidogrel", "Prasugrel", "Ticagrelor",
  
  // Vitamins/Supplements
  "Vitamin D3", "Vitamin B12", "Vitamin C", "Vitamin E", "Multivitamin", "Calcium Carbonate",
  "Calcium Citrate", "Magnesium", "Potassium", "Omega-3", "Probiotics", "Glucosamine",
  "Chondroitin", "Coenzyme Q10", "Biotin", "Thiamine", "Riboflavin", "Niacin",
  
  // Allergy/Immunology
  "Cetirizine", "Loratadine", "Fexofenadine", "Diphenhydramine", "Chlorpheniramine",
  "Promethazine", "Cromolyn", "Epinephrine", "Methylprednisolone", "Triamcinolone",
  
  // Additional Common Medications
  "Acetylsalicylic Acid", "Allopurinol", "Colchicine", "Probenecid", "Methotrexate",
  "Hydroxychloroquine", "Sulfasalazine", "Leflunomide", "Etanercept", "Adalimumab",
  "Infliximab", "Rituximab", "Cyclophosphamide", "Azathioprine", "Mycophenolate",
  
  // Specialty/Biologics
  "Humira", "Enbrel", "Remicade", "Rituxan", "Herceptin", "Avastin", "Keytruda",
  "Opdivo", "Tecfidera", "Copaxone", "Avonex", "Rebif", "Gilenya", "Tysabri",
  
  // Emergency/Critical Care
  "Epinephrine", "Atropine", "Adenosine", "Amiodarone", "Lidocaine", "Dopamine",
  "Norepinephrine", "Vasopressin", "Nitroglycerin", "Metoprolol", "Esmolol",
  
  // Hormonal
  "Estradiol", "Progesterone", "Testosterone", "Hydrocortisone", "Prednisone",
  "Dexamethasone", "Fludrocortisone", "Levothyroxine", "Liothyronine", "Calcitriol",
  
  // Cancer/Chemotherapy (common ones)
  "Tamoxifen", "Anastrozole", "Letrozole", "Exemestane", "Paclitaxel", "Carboplatin",
  "Cisplatin", "Doxorubicin", "Cyclophosphamide", "Fluorouracil", "Capecitabine",
  
  // Pediatric Common
  "Children's Tylenol", "Children's Motrin", "Amoxicillin Suspension", "Azithromycin Suspension",
  "Prednisolone Syrup", "Albuterol Syrup", "Iron Drops", "Vitamin D Drops",
  
  // OTC Common
  "Tylenol", "Advil", "Motrin", "Aleve", "Benadryl", "Claritin", "Zyrtec", "Allegra",
  "Pepto-Bismol", "Imodium", "Mylanta", "Tums", "Rolaids", "Gas-X", "Senokot",
  "Colace", "Preparation H", "Cortisone-10", "Neosporin", "Bacitracin"
];

/**
 * @openapi
 * /api/medications/populate-comprehensive-catalog:
 *   post:
 *     summary: Populate medication catalog from static comprehensive medication list
 *     description: 
 *     tags:
 *       - Medications
 *     responses:
 *       200:
 *         description: Catalog populated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Medication catalog populated successfully
 *                 total_medications:
 *                   type: integer
 *                   example: 200
 *                 processed:
 *                   type: integer
 *                   example: 200
 *       405:
 *         description: Method not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error during medication catalog population
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to populate medication catalog
 *                 details:
 *                   type: string
 *                   example: Error message details here
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { DatabasePool } = require('../../../lib/database-pool')
  const client = await DatabasePool.getClient();

  try {
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

    // Clear existing catalog
    await client.query('DELETE FROM medication_catalog');
    
    // Batch insert medications
    const batchSize = 50;
    let totalInserted = 0;
    
    for (let i = 0; i < COMPREHENSIVE_MEDICATIONS.length; i += batchSize) {
      const batch = COMPREHENSIVE_MEDICATIONS.slice(i, i + batchSize);
      const values = batch.map((med: string) => `('${med.replace(/'/g, "''")}')`).join(',');
      
      await client.query(`
        INSERT INTO medication_catalog (name)
        VALUES ${values}
        ON CONFLICT (name) DO NOTHING
      `);
      
      totalInserted += batch.length;
    }

    // Get final count
    const countResult = await client.query('SELECT COUNT(*) as count FROM medication_catalog');
    const finalCount = countResult.rows[0].count;

    res.status(200).json({
      success: true,
      message: `Medication catalog populated successfully`,
      total_medications: finalCount,
      processed: COMPREHENSIVE_MEDICATIONS.length
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