import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { authDB } from '../../lib/auth-database'

/**
 * @openapi
 * /api/profile/index:
 *   get:
 *     tags:
 *       - Profile
 *     summary: Get user profile
 *     description: Retrieves complete user profile data, including personal details and address.
 *     parameters:
 *       - name: sessionToken
 *         in: query
 *         description: Session token for user authentication
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 profile:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     dateOfBirth:
 *                       type: string
 *                       format: date
 *                     genderAtBirth:
 *                       type: string
 *                     isVerified:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     streetAddress1:
 *                       type: string
 *                     streetAddress2:
 *                       type: string
 *                     city:
 *                       type: string
 *                     stateProvince:
 *                       type: string
 *                     postalCode:
 *                       type: string
 *                     country:
 *                       type: string
 *                     addressValidated:
 *                       type: boolean
 *       401:
 *         description: Unauthorized - session token missing or invalid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Session token required
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Profile not found
 *       405:
 *         description: Method not allowed (only GET, PUT, DELETE supported)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Method not allowed
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error
 *
 *   put:
 *     tags:
 *       - Profile
 *     summary: Update user profile
 *     description: Updates user profile fields including personal info and address.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionToken:
 *                 type: string
 *                 description: Session token for authentication
 *               updates:
 *                 type: object
 *                 description: Fields to update
 *                 properties:
 *                   firstName:
 *                     type: string
 *                   lastName:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   dateOfBirth:
 *                     type: string
 *                     format: date
 *                   genderAtBirth:
 *                     type: string
 *                   streetAddress1:
 *                     type: string
 *                   streetAddress2:
 *                     type: string
 *                   city:
 *                     type: string
 *                   stateProvince:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *                   country:
 *                     type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                   example: Profile updated successfully
 *                 profile:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     dateOfBirth:
 *                       type: string
 *                       format: date
 *                     genderAtBirth:
 *                       type: string
 *                     isVerified:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     streetAddress1:
 *                       type: string
 *                     streetAddress2:
 *                       type: string
 *                     city:
 *                       type: string
 *                     stateProvince:
 *                       type: string
 *                     postalCode:
 *                       type: string
 *                     country:
 *                       type: string
 *                     addressValidated:
 *                       type: boolean
 *       400:
 *         description: Bad request (missing updates)
 *       401:
 *         description: Unauthorized (missing or invalid session token)
 *       409:
 *         description: Conflict (email address already in use)
 *       404:
 *         description: Profile not found or update failed
 *       500:
 *         description: Internal server error
 *
 *   delete:
 *     tags:
 *       - Profile
 *     summary: Deactivate user account
 *     description: Deactivates the authenticated user's account.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sessionToken:
 *                 type: string
 *                 description: Session token for authentication
 *     responses:
 *       200:
 *         description: Account deactivated successfully
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
 *                   example: Account deactivated successfully
 *       401:
 *         description: Unauthorized (missing or invalid session token)
 *       500:
 *         description: Internal server error
 *
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  try {
    await authDB.initializeSchema()

    switch (method) {
      case 'GET':
        return await handleGetProfile(req, res)
      case 'PUT':
        return await handleUpdateProfile(req, res)
      case 'DELETE':
        return await handleDeactivateProfile(req, res)
      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Profile API error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// GET /api/profile - Get user profile
async function handleGetProfile(req: NextApiRequest, res: NextApiResponse) {
  const { sessionToken } = req.query

  if (!sessionToken || typeof sessionToken !== 'string') {
    return res.status(401).json({ error: 'Session token required' })
  }

  try {
    // Validate session and get user data
    const sessionData = await authDB.validateSession(sessionToken)
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    // Get complete user profile
    const profile = await authDB.getUserProfile(sessionData.id)
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    // Remove sensitive fields for client response
    const { 
      id, email, phone, first_name, last_name, date_of_birth, gender_at_birth, 
      is_verified, created_at, updated_at,
      street_address_1, street_address_2, city, state_province, postal_code, country, address_validated
    } = profile

    return res.status(200).json({
      success: true,
      profile: {
        id,
        email,
        phone: phone || '',
        firstName: first_name,
        lastName: last_name,
        dateOfBirth: date_of_birth,
        genderAtBirth: gender_at_birth,
        isVerified: is_verified,
        createdAt: created_at,
        updatedAt: updated_at,
        // Address fields
        streetAddress1: street_address_1 || '',
        streetAddress2: street_address_2 || '',
        city: city || '',
        stateProvince: state_province || '',
        postalCode: postal_code || '',
        country: country || '',
        addressValidated: address_validated || false
      }
    })
  } catch (error) {
    console.error('Get profile error:', error)
    return res.status(500).json({ error: 'Failed to retrieve profile' })
  }
}

// PUT /api/profile - Update user profile
async function handleUpdateProfile(req: NextApiRequest, res: NextApiResponse) {
  const { sessionToken, updates } = req.body

  if (!sessionToken) {
    return res.status(401).json({ error: 'Session token required' })
  }

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Profile updates required' })
  }

  try {
    // Validate session
    const sessionData = await authDB.validateSession(sessionToken)
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    // Validate email uniqueness if email is being updated
    if (updates.email && updates.email !== sessionData.email) {
      const emailExists = await authDB.emailExists(updates.email, sessionData.id)
      if (emailExists) {
        return res.status(409).json({ error: 'Email address already in use' })
      }
    }

    // Update profile including address fields
    const updatedProfile = await authDB.updateUserProfile(sessionData.id, {
      firstName: updates.firstName,
      lastName: updates.lastName,
      email: updates.email,
      phone: updates.phone,
      dateOfBirth: updates.dateOfBirth,
      genderAtBirth: updates.genderAtBirth,
      streetAddress1: updates.streetAddress1,
      streetAddress2: updates.streetAddress2,
      city: updates.city,
      stateProvince: updates.stateProvince,
      postalCode: updates.postalCode,
      country: updates.country
    })

    if (!updatedProfile) {
      return res.status(404).json({ error: 'Profile not found or update failed' })
    }

    // Format response
    const { 
      id, email, phone, first_name, last_name, date_of_birth, gender_at_birth, 
      is_verified, created_at, updated_at,
      street_address_1, street_address_2, city, state_province, postal_code, country, address_validated
    } = updatedProfile

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        id,
        email,
        phone: phone || '',
        firstName: first_name,
        lastName: last_name,
        dateOfBirth: date_of_birth,
        genderAtBirth: gender_at_birth,
        isVerified: is_verified,
        createdAt: created_at,
        updatedAt: updated_at,
        // Address fields
        streetAddress1: street_address_1 || '',
        streetAddress2: street_address_2 || '',
        city: city || '',
        stateProvince: state_province || '',
        postalCode: postal_code || '',
        country: country || '',
        addressValidated: address_validated || false
      }
    })
  } catch (error) {
    console.error('Update profile error:', error)
    return res.status(500).json({ error: 'Failed to update profile' })
  }
}

// DELETE /api/profile - Deactivate user account
async function handleDeactivateProfile(req: NextApiRequest, res: NextApiResponse) {
  const { sessionToken } = req.body

  if (!sessionToken) {
    return res.status(401).json({ error: 'Session token required' })
  }

  try {
    // Validate session
    const sessionData = await authDB.validateSession(sessionToken)
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    // Deactivate user account
    await authDB.deactivateUser(sessionData.id)

    return res.status(200).json({
      success: true,
      message: 'Account deactivated successfully'
    })
  } catch (error) {
    console.error('Deactivate profile error:', error)
    return res.status(500).json({ error: 'Failed to deactivate account' })
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}