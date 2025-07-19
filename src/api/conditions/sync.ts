import { Request, Response } from 'express';
import type { NextApiRequest, NextApiResponse } from 'next'
import { DatabasePool } from '../../lib/database-pool';
import { getValidJWTToken } from '../../lib/jwt-manager'

const dbPool = DatabasePool.getInstance()

interface Condition {
  id: string
  display_name: string
  source_links: string[]
}

interface ConditionsResponse {
  conditions: Condition[]
}

/**
 * @openapi
 * /api/conditions/sync:
 *   post:
 *     summary: Sync static conditions into the database
 *     description: Initializes the `conditions_library` table and inserts a predefined list of medical conditions if not already cached.
 *     tags:
 *       - Conditions
 *     responses:
 *       200:
 *         description: Conditions successfully cached or already present.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Successfully cached 15 conditions
 *                 cached:
 *                   type: boolean
 *                   example: false
 *                 count:
 *                   type: integer
 *                   example: 15
 *       405:
 *         description: Method Not Allowed - only POST supported.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Server error during conditions sync
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error while syncing conditions
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Initialize conditions table
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS conditions_library (
        id VARCHAR(255) PRIMARY KEY,
        display_name VARCHAR(500) NOT NULL,
        source_links JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)

    // Check if we already have conditions cached
    const existingConditions = await dbPool.query('SELECT COUNT(*) FROM conditions_library')
    const conditionCount = parseInt(existingConditions.rows[0].count)

    if (conditionCount > 0) {
      return res.status(200).json({ 
        message: `Conditions already cached (${conditionCount} conditions)`,
        cached: true 
      })
    }

    // Using medical conditions database from existing system
    // This data structure matches the API specification
    const sampleConditions: Condition[] = [
      {
        id: "hypertension@C0020538",
        display_name: "Hypertension",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/high-blood-pressure/symptoms-causes/syc-20373410",
          "https://www.heart.org/en/health-topics/high-blood-pressure"
        ]
      },
      {
        id: "diabetes@C0011849",
        display_name: "Diabetes Mellitus",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/diabetes/symptoms-causes/syc-20371444"
        ]
      },
      {
        id: "asthma@C0004096",
        display_name: "Asthma",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/asthma/symptoms-causes/syc-20369653",
          "https://www.lung.org/lung-health-diseases/lung-disease-lookup/asthma"
        ]
      },
      {
        id: "arthritis@C0003864",
        display_name: "Arthritis",
        source_links: [
          "https://www.arthritis.org/health-wellness/about-arthritis/understanding-arthritis"
        ]
      },
      {
        id: "depression@C0011570",
        display_name: "Depression",
        source_links: [
          "https://www.nimh.nih.gov/health/topics/depression"
        ]
      },
      {
        id: "anxiety@C0003467",
        display_name: "Anxiety Disorder",
        source_links: [
          "https://www.nimh.nih.gov/health/topics/anxiety-disorders"
        ]
      },
      {
        id: "hypothyroidism@C0020676",
        display_name: "Hypothyroidism",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/hypothyroidism/symptoms-causes/syc-20350284"
        ]
      },
      {
        id: "migraine@C0149931",
        display_name: "Migraine",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/migraine-headache/symptoms-causes/syc-20360201"
        ]
      },
      {
        id: "gerd@C0017168",
        display_name: "Gastroesophageal Reflux Disease (GERD)",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/gerd/symptoms-causes/syc-20361940"
        ]
      },
      {
        id: "osteoporosis@C0029456",
        display_name: "Osteoporosis",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/osteoporosis/symptoms-causes/syc-20351968"
        ]
      },
      {
        id: "copd@C0024117",
        display_name: "Chronic Obstructive Pulmonary Disease (COPD)",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/copd/symptoms-causes/syc-20353679"
        ]
      },
      {
        id: "fibromyalgia@C0016053",
        display_name: "Fibromyalgia",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/fibromyalgia/symptoms-causes/syc-20354780"
        ]
      },
      {
        id: "sleep_apnea@C0037315",
        display_name: "Sleep Apnea",
        source_links: [
          "https://www.mayoclinic.org/diseases-conditions/sleep-apnea/symptoms-causes/syc-20377631"
        ]
      },
      {
        id: "kidney_disease@C0022658",
        display_name: "Chronic Kidney Disease",
        source_links: [
          "https://www.kidney.org/atoz/content/about-chronic-kidney-disease"
        ]
      },
      {
        id: "heart_disease@C0018799",
        display_name: "Coronary Heart Disease",
        source_links: [
          "https://www.cdc.gov/heartdisease/coronary_ad.htm"
        ]
      }
    ]

    // Insert conditions into database
    for (const condition of sampleConditions) {
      await dbPool.query(
        'INSERT INTO conditions_library (id, display_name, source_links) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [condition.id, condition.display_name, JSON.stringify(condition.source_links)]
      )
    }

    return res.status(200).json({ 
      message: `Successfully cached ${sampleConditions.length} conditions`,
      cached: false,
      count: sampleConditions.length
    })
  } catch (error) {
    console.error('Error syncing conditions:', error)
    return res.status(500).json({ 
      error: 'Internal server error while syncing conditions' 
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}