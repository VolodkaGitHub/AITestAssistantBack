import { NextApiRequest, NextApiResponse } from 'next'
import RateLimiter, { RATE_LIMITS } from './rate-limiter'
import SessionManager from './session-manager'
import { getClientIP, getUserIdentifier } from './utils'

export interface ExtendedNextApiRequest extends NextApiRequest {
  userId?: string
  userEmail?: string
  sessionId?: string
  userSession?: any
  rateLimitInfo?: any
}

export function withRateLimit(endpoint: keyof typeof RATE_LIMITS) {
  return function (handler: (req: ExtendedNextApiRequest, res: NextApiResponse) => Promise<void>) {
    return async (req: ExtendedNextApiRequest, res: NextApiResponse) => {
      const rateLimiter = RateLimiter.getInstance()
      const identifier = getUserIdentifier(req)
      const rateLimitConfig = RATE_LIMITS[endpoint]

      try {
        const rateLimitResult = await rateLimiter.checkRateLimit(
          identifier,
          endpoint,
          rateLimitConfig
        )

        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', rateLimitConfig.maxRequests)
        res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining)
        res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime.toISOString())

        if (!rateLimitResult.allowed) {
          return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Too many requests. Limit: ${rateLimitConfig.maxRequests} per ${rateLimitConfig.windowMs / 1000} seconds`,
            resetTime: rateLimitResult.resetTime.toISOString()
          })
        }

        req.rateLimitInfo = rateLimitResult
        return handler(req, res)
      } catch (error) {
        console.error('Rate limiting error:', error)
        // Continue with request if rate limiter fails
        return handler(req, res)
      }
    }
  }
}

export function withSession(requireSession: boolean = false) {
  return function (handler: (req: ExtendedNextApiRequest, res: NextApiResponse) => Promise<void>) {
    return async (req: ExtendedNextApiRequest, res: NextApiResponse) => {
      const sessionManager = SessionManager.getInstance()
      const sessionId = req.headers['x-session-id'] as string || req.query.sessionId as string

      if (sessionId) {
        try {
          const session = await sessionManager.getSession(sessionId)
          if (session) {
            req.sessionId = sessionId
            req.userId = session.userId
            req.userEmail = session.userEmail
            req.userSession = session
          } else if (requireSession) {
            return res.status(401).json({
              error: 'Invalid or expired session',
              message: 'Please create a new session'
            })
          }
        } catch (error) {
          console.error('Session validation error:', error)
          if (requireSession) {
            return res.status(500).json({
              error: 'Session validation failed',
              message: 'Unable to validate session'
            })
          }
        }
      } else if (requireSession) {
        return res.status(401).json({
          error: 'Session required',
          message: 'Please provide a valid session ID'
        })
      }

      return handler(req, res)
    }
  }
}

export function withUserContext() {
  return function (handler: (req: ExtendedNextApiRequest, res: NextApiResponse) => Promise<void>) {
    return async (req: ExtendedNextApiRequest, res: NextApiResponse) => {
      // Extract user context from various sources
      const userEmail = req.headers['x-user-email'] as string || 
                       req.body?.userEmail || 
                       req.query.userEmail as string

      const userId = req.headers['x-user-id'] as string || 
                    req.body?.userId || 
                    req.query.userId as string ||
                    userEmail // Fallback to email as user ID

      if (userId) {
        req.userId = userId
      }
      if (userEmail) {
        req.userEmail = userEmail
      }

      return handler(req, res)
    }
  }
}

export function withErrorHandling() {
  return function (handler: (req: ExtendedNextApiRequest, res: NextApiResponse) => Promise<void>) {
    return async (req: ExtendedNextApiRequest, res: NextApiResponse) => {
      try {
        await handler(req, res)
      } catch (error) {
        console.error('API Error:', {
          endpoint: req.url,
          method: req.method,
          userId: req.userId,
          error: error instanceof Error ? error.message : error
        })

        // Don't send error details in production
        const isDevelopment = process.env.NODE_ENV === 'development'
        
        res.status(500).json({
          error: 'Internal server error',
          message: isDevelopment ? (error instanceof Error ? error.message : 'Unknown error') : 'Something went wrong',
          timestamp: new Date().toISOString(),
          ...(isDevelopment && { stack: error instanceof Error ? error.stack : undefined })
        })
      }
    }
  }
}

export function withCORS() {
  return function (handler: (req: ExtendedNextApiRequest, res: NextApiResponse) => Promise<void>) {
    return async (req: ExtendedNextApiRequest, res: NextApiResponse) => {
      // Handle CORS
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Session-ID, X-User-Email, X-User-ID'
      )

      if (req.method === 'OPTIONS') {
        res.status(200).end()
        return
      }

      return handler(req, res)
    }
  }
}

// Composite middleware that combines multiple middleware functions
export function withScalableMiddleware(
  endpoint: keyof typeof RATE_LIMITS,
  options: {
    requireSession?: boolean
    requireUserContext?: boolean
  } = {}
) {
  return function (handler: (req: ExtendedNextApiRequest, res: NextApiResponse) => Promise<void>) {
    let composedHandler = handler

    // Apply middleware in reverse order (last applied runs first)
    composedHandler = withErrorHandling()(composedHandler)
    
    if (options.requireSession) {
      composedHandler = withSession(true)(composedHandler)
    } else {
      composedHandler = withSession(false)(composedHandler)
    }
    
    if (options.requireUserContext) {
      composedHandler = withUserContext()(composedHandler)
    }
    
    composedHandler = withRateLimit(endpoint)(composedHandler)
    composedHandler = withCORS()(composedHandler)

    return composedHandler
  }
}

export default {
  withRateLimit,
  withSession,
  withUserContext,
  withErrorHandling,
  withCORS,
  withScalableMiddleware
}