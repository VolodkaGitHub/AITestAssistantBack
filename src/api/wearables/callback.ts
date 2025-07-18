import { Request, Response } from 'express';
import { NextApiRequest, NextApiResponse } from 'next'
import { terraClient } from '../../lib/terra-client'
import { WearablesDatabase } from '../../lib/wearables-database'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user_id, status, resource, reference_id } = req.query

    if (status === 'success' && user_id && resource && reference_id) {
      // Get the Terra user info to retrieve scopes and details
      const terraUser = await terraClient.getUser(user_id as string)
      
      if (!terraUser) {
        console.error('Failed to get Terra user info for:', user_id)
        return res.redirect(`${process.env.NEXTAUTH_URL}/profile?error=terra_user_not_found`)
      }

      // Save the successful connection
      await WearablesDatabase.createConnection({
        user_id: reference_id as string,
        provider: resource as string,
        terra_user_id: user_id as string,
        scopes: terraUser.scopes || []
      })

      // Redirect to success page
      return res.redirect(`${process.env.NEXTAUTH_URL}/profile?success=wearable_connected&provider=${resource}`)
      
    } else if (status === 'error') {
      console.error('Terra authentication failed:', req.query)
      return res.redirect(`${process.env.NEXTAUTH_URL}/profile?error=auth_failed`)
    }

    // Invalid callback parameters
    return res.redirect(`${process.env.NEXTAUTH_URL}/profile?error=invalid_callback`)

  } catch (error) {
    console.error('Error in wearables callback handler:', error)
    return res.redirect(`${process.env.NEXTAUTH_URL}/profile?error=callback_error`)
  }
}

export default async function expressAdapter(req: Request, res: Response) {
  return await handler(req as any, res as any);
}