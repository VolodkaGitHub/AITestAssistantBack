import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'

interface AddressValidationRequest {
  streetAddress1: string
  streetAddress2?: string
  city: string
  stateProvince: string
  postalCode: string
  country: string
}

interface AddressValidationResponse {
  success: boolean
  validation?: any
  suggestions?: any[]
  error?: string
}

/**
 * @openapi
 * /api/address/validate:
 *   post:
 *     summary: Validate an address using Google Maps Address Validation API or mock logic
 *     description: Checks a user-submitted mailing address for validity and optionally suggests corrections.
 *     tags:
 *       - Address
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - streetAddress1
 *               - city
 *               - stateProvince
 *               - postalCode
 *               - country
 *             properties:
 *               streetAddress1:
 *                 type: string
 *               streetAddress2:
 *                 type: string
 *                 nullable: true
 *               city:
 *                 type: string
 *               stateProvince:
 *                 type: string
 *               postalCode:
 *                 type: string
 *               country:
 *                 type: string
 *     responses:
 *       200:
 *         description: Address validation completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 validation:
 *                   type: object
 *                   nullable: true
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                   nullable: true
 *                 error:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: Bad request — required address fields missing
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Address validation service failed
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      streetAddress1,
      streetAddress2,
      city,
      stateProvince,
      postalCode,
      country
    }: AddressValidationRequest = req.body

    // Validate required fields
    if (!streetAddress1 || !city || !stateProvince || !postalCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Required address fields missing' 
      })
    }

    // For development/testing, we'll implement a mock validation
    // In production, this would use Google Maps Address Validation API
    if (process.env.NODE_ENV === 'development' || !process.env.GOOGLE_MAPS_API_KEY) {
      // Mock validation for development
      const isValidZip = /^\d{5}(-\d{4})?$/.test(postalCode) // US ZIP format
      const hasValidComponents = streetAddress1.length > 0 && 
                                city.length > 0 && 
                                stateProvince.length > 0

      const mockResponse: AddressValidationResponse = {
        success: true,
        validation: {
          verdict: {
            addressComplete: isValidZip && hasValidComponents,
            hasInferredComponents: false,
            hasReplacedComponents: false,
            hasUnconfirmedComponents: !isValidZip
          },
          address: {
            formattedAddress: `${streetAddress1}${streetAddress2 ? ', ' + streetAddress2 : ''}, ${city}, ${stateProvince} ${postalCode}, ${country}`,
            addressComponents: [
              {
                componentType: 'street_number',
                componentName: { text: streetAddress1.split(' ')[0] }
              },
              {
                componentType: 'route',
                componentName: { text: streetAddress1.split(' ').slice(1).join(' ') }
              },
              {
                componentType: 'locality',
                componentName: { text: city }
              },
              {
                componentType: 'administrative_area_level_1',
                componentName: { text: stateProvince }
              },
              {
                componentType: 'postal_code',
                componentName: { text: postalCode }
              },
              {
                componentType: 'country',
                componentName: { text: country }
              }
            ]
          }
        },
        suggestions: !isValidZip ? [{
          formattedAddress: `${streetAddress1}${streetAddress2 ? ', ' + streetAddress2 : ''}, ${city}, ${stateProvince} 12345, ${country}`,
          note: 'Please verify ZIP code format'
        }] : []
      }

      return res.status(200).json(mockResponse)
    }

    // Production implementation with Google Maps Address Validation API
    const addressInput = {
      address: {
        addressLines: [streetAddress1, streetAddress2].filter(Boolean),
        locality: city,
        administrativeArea: stateProvince,
        postalCode: postalCode,
        regionCode: country === 'United States' ? 'US' : 
                   country === 'Canada' ? 'CA' : 
                   country === 'United Kingdom' ? 'GB' : 'US'
      }
    }

    const googleResponse = await fetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${process.env.GOOGLE_MAPS_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(addressInput)
      }
    )

    if (!googleResponse.ok) {
      throw new Error(`Google API error: ${googleResponse.statusText}`)
    }

    const validationResult = await googleResponse.json()

    // Parse Google's response and format for our frontend
    const response: AddressValidationResponse = {
      success: true,
      validation: validationResult.result,
      suggestions: validationResult.result?.verdict?.hasUnconfirmedComponents ? 
        [validationResult.result?.address] : []
    }

    res.status(200).json(response)

  } catch (error) {
    console.error('Address validation error:', error)
    res.status(500).json({ 
      success: false,
      error: 'Address validation service temporarily unavailable' 
    })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}