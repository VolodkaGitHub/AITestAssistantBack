// Enhanced Session Security Management
export class SessionSecurity {
  private static instance: SessionSecurity
  private inactivityTimeout = 30 * 60 * 1000 // 30 minutes
  private activityTimer: NodeJS.Timeout | null = null
  private onSessionExpired?: () => void

  private constructor() {}

  static getInstance(): SessionSecurity {
    if (!SessionSecurity.instance) {
      SessionSecurity.instance = new SessionSecurity()
    }
    return SessionSecurity.instance
  }

  // Initialize session tracking
  init(onSessionExpired?: () => void) {
    this.onSessionExpired = onSessionExpired
    this.updateActivity()
    this.startActivityTracking()
  }

  // Update last activity timestamp
  updateActivity() {
    localStorage.setItem('treatment_ai_last_activity', Date.now().toString())
    this.resetInactivityTimer()
  }

  // Start tracking user activity
  private startActivityTracking() {
    // Track mouse movements, clicks, and keyboard activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    
    const activityHandler = () => {
      this.updateActivity()
    }

    events.forEach(event => {
      document.addEventListener(event, activityHandler, true)
    })

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.updateActivity()
      }
    })
  }

  // Reset inactivity timer
  private resetInactivityTimer() {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
    }

    this.activityTimer = setTimeout(() => {
      this.handleInactivityTimeout()
    }, this.inactivityTimeout)
  }

  // Handle session timeout due to inactivity
  private handleInactivityTimeout() {
    console.log('Session expired due to inactivity')
    this.clearSession()
    if (this.onSessionExpired) {
      this.onSessionExpired()
    }
  }

  // Check if current session is valid
  isSessionValid(): boolean {
    const sessionToken = localStorage.getItem('treatment_ai_session_token')
    const lastActivity = localStorage.getItem('treatment_ai_last_activity')
    
    if (!sessionToken || !lastActivity) {
      return false
    }

    const timeSinceActivity = Date.now() - parseInt(lastActivity)
    return timeSinceActivity < this.inactivityTimeout
  }

  // Clear all session data
  clearSession() {
    localStorage.removeItem('treatment_ai_session_token')
    localStorage.removeItem('treatment_ai_user_data')
    localStorage.removeItem('treatment_ai_last_activity')
    
    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
      this.activityTimer = null
    }
  }

  // Get session info for debugging
  getSessionInfo() {
    const sessionToken = localStorage.getItem('treatment_ai_session_token')
    const lastActivity = localStorage.getItem('treatment_ai_last_activity')
    
    if (!sessionToken || !lastActivity) {
      return { hasSession: false }
    }

    const lastActivityTime = new Date(parseInt(lastActivity))
    const timeSinceActivity = Date.now() - parseInt(lastActivity)
    const timeUntilExpiry = this.inactivityTimeout - timeSinceActivity
    
    return {
      hasSession: true,
      lastActivity: lastActivityTime,
      timeUntilExpiry: Math.max(0, timeUntilExpiry),
      isValid: this.isSessionValid()
    }
  }

  // Force session logout with server notification
  async forceLogout(reason: string = 'manual') {
    try {
      const sessionToken = localStorage.getItem('treatment_ai_session_token')
      if (sessionToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken, reason })
        })
      }
    } catch (error) {
      console.error('Logout API error:', error)
    } finally {
      this.clearSession()
    }
  }
}

// Export singleton instance
export const sessionSecurity = SessionSecurity.getInstance()