import axios from 'axios'

interface JWTTokenCache {
  token: string
  expiresAt: number
}

let tokenCache: JWTTokenCache | null = null

const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000 // 5 minutes before expiry

export async function getValidJWTToken(): Promise<string> {
  const now = Date.now()
  
  // Check if we have a valid cached token
  if (tokenCache && tokenCache.expiresAt > now + TOKEN_REFRESH_BUFFER) {
    console.log('Using cached JWT token')
    return tokenCache.token
  }
  
  console.log('Refreshing JWT token...')
  
  try {
    // Direct UMA API call (same as working before)
    const UMA_API_URL = 'https://uma-394631772515.us-central1.run.app'
    const response = await axios.get(`${UMA_API_URL}/get-token`, {
      headers: {
        'Authorization': `basic ${process.env.UMA_API_KEY}`,
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      timeout: 15000
    })
    
    const access_token = response.data.token
    const expiresAt = now + (3600 * 1000) // 1 hour in milliseconds
    
    tokenCache = {
      token: access_token,
      expiresAt
    }
    
    console.log('Fresh JWT token obtained, expires at:', new Date(expiresAt).toISOString())
    return access_token
    
  } catch (error) {
    console.error('Failed to refresh JWT token:', error)
    // Clear cache on failure so we'll retry next time
    tokenCache = null
    throw new Error('JWT token refresh failed')
  }
}

export function clearTokenCache(): void {
  tokenCache = null
  console.log('JWT token cache cleared')
}

export function getTokenInfo(): { hasToken: boolean; expiresAt?: string } {
  if (!tokenCache) {
    return { hasToken: false }
  }
  
  return {
    hasToken: true,
    expiresAt: new Date(tokenCache.expiresAt).toISOString()
  }
}