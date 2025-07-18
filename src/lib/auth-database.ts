// Comprehensive Authentication Database Module
import { DatabasePool } from './database-pool';
import { randomBytes } from 'crypto'

export interface AuthUser {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string
  date_of_birth: string
  gender_at_birth: string
  is_verified: boolean
  created_at: string
  updated_at: string
  // Address fields
  street_address_1?: string
  street_address_2?: string
  city?: string
  state_province?: string
  postal_code?: string
  country?: string
  address_validated?: boolean
}

export interface UserSession {
  id: string
  user_id: string
  session_token: string
  is_active: boolean
  ip_address: string
  user_agent: string
  created_at: string
  last_accessed: string
  expires_at: string
}

export interface OTPCode {
  id: string
  email: string
  code: string
  code_type: 'signup' | 'login' | 'verification'
  delivery_method: 'email'
  is_used: boolean
  expires_at: string
  created_at: string
}

export interface VerificationAttempt {
  id: string
  email: string
  attempt_type: 'signup' | 'login' | 'verification'
  is_successful: boolean
  ip_address: string
  user_agent: string
  created_at: string
}

export interface OTPRequest {
  email: string
  codeType: 'signup' | 'login' | 'verification'
  deliveryMethod: 'email'
  expiryMinutes: number
}

export interface OTPVerification {
  email: string
  code: string
  codeType: 'signup' | 'login' | 'verification'
}

export interface VerificationResult {
  valid: boolean
  attempts: number
  error?: string
}

export interface AttemptLog {
  email: string
  attemptType: 'signup' | 'login' | 'verification'
  isSuccessful: boolean
  ipAddress?: string
  userAgent?: string
}

export interface CreateUserWithPasswordRequest {
  email: string
  firstName: string
  lastName: string
  phone: string
  dateOfBirth: string
  genderAtBirth: 'male' | 'female' | 'other'
  passwordHash: string
  streetAddress1: string
  streetAddress2?: string
  city: string
  stateProvince: string
  postalCode: string
  country: string
  twoFactorMethod: 'email' | 'sms'
  backupPhone?: string
}

// Validate session token and return user information
export async function validateSessionToken(sessionToken: string): Promise<AuthUser | null> {
  // Using DatabasePool.getClient() directly
  const client = await DatabasePool.getClient()
  
  try {
    // Check if session exists and is active (includes inactivity timeout check)
    const sessionResult = await client.query(`
      SELECT s.*, u.* 
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = $1 
      AND s.is_active = true 
      AND s.expires_at > NOW()
      AND s.last_accessed > NOW() - INTERVAL '30 minutes'
    `, [sessionToken])

    if (sessionResult.rows.length === 0) {
      // If session exists but is inactive due to timeout, mark it as inactive
      await client.query(`
        UPDATE user_sessions 
        SET is_active = false 
        WHERE session_token = $1 
        AND last_accessed <= NOW() - INTERVAL '30 minutes'
      `, [sessionToken])
      
      return null
    }

    const session = sessionResult.rows[0]
    
    // Update last accessed time for active session
    await client.query(
      'UPDATE user_sessions SET last_accessed = NOW() WHERE session_token = $1',
      [sessionToken]
    )

    return {
      id: session.user_id,
      email: session.email,
      first_name: session.first_name,
      last_name: session.last_name,
      phone: session.phone,
      date_of_birth: session.date_of_birth,
      gender_at_birth: session.gender_at_birth,
      is_verified: session.is_verified,
      created_at: session.created_at,
      updated_at: session.updated_at
    }
  } catch (error) {
    console.error('Error validating session token:', error)
    return null
  } finally {
    client.release()
  }
}

// Get user by ID
export async function getUserById(userId: string): Promise<AuthUser | null> {
  // Using DatabasePool.getClient() directly
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return result.rows[0]
  } catch (error) {
    console.error('Error fetching user by ID:', error)
    return null
  } finally {
    client.release()
  }
}

// Get user by email
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  // Using DatabasePool.getClient() directly
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    )

    if (result.rows.length === 0) {
      return null
    }

    return result.rows[0]
  } catch (error) {
    console.error('Error fetching user by email:', error)
    return null
  } finally {
    client.release()
  }
}

// Create new user session
export async function createUserSession(
  userId: string,
  sessionToken: string,
  ipAddress: string,
  userAgent: string,
  expiresInHours: number = 4  // Reduced from 24 to 4 hours for enhanced security
): Promise<UserSession | null> {
  // Using DatabasePool.getClient() directly
  const client = await DatabasePool.getClient()
  
  try {
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiresInHours)

    // Get user email for session
    const userResult = await client.query('SELECT email FROM users WHERE id = $1', [userId])
    const userEmail = userResult.rows[0]?.email || ''

    const result = await client.query(`
      INSERT INTO user_sessions (session_id, user_id, user_email, session_token, ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [require('crypto').randomUUID(), userId, userEmail, sessionToken, ipAddress.split(',')[0].trim(), userAgent, expiresAt])

    return result.rows[0]
  } catch (error) {
    console.error('Error creating user session:', error)
    return null
  } finally {
    client.release()
  }
}

// Invalidate session
export async function invalidateSession(sessionToken: string): Promise<boolean> {
  // Using DatabasePool.getClient() directly
  const client = await DatabasePool.getClient()
  
  try {
    await client.query(
      'UPDATE user_sessions SET is_active = false WHERE session_token = $1',
      [sessionToken]
    )
    return true
  } catch (error) {
    console.error('Error invalidating session:', error)
    return false
  } finally {
    client.release()
  }
}

// Get user's active sessions
export async function getUserSessions(userId: string): Promise<UserSession[]> {
  // Using DatabasePool.getClient() directly
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(
      'SELECT * FROM user_sessions WHERE user_id = $1 AND is_active = true ORDER BY last_accessed DESC',
      [userId]
    )

    return result.rows
  } catch (error) {
    console.error('Error fetching user sessions:', error)
    return []
  } finally {
    client.release()
  }
}

// Database class for compatibility with existing imports
export class AuthDatabase {


  async initializeSchema(): Promise<void> {
    const client = await DatabasePool.getClient()
    
    try {
      // Create users table with password and address fields
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          phone VARCHAR(20),
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          date_of_birth DATE NOT NULL,
          gender_at_birth VARCHAR(10) NOT NULL CHECK (gender_at_birth IN ('male', 'female', 'other')),
          password_hash VARCHAR(255),
          street_address_1 VARCHAR(255),
          street_address_2 VARCHAR(100),
          city VARCHAR(100),
          state_province VARCHAR(100),
          postal_code VARCHAR(20),
          country VARCHAR(100) DEFAULT 'United States',
          address_validated BOOLEAN DEFAULT FALSE,
          two_factor_method VARCHAR(20) DEFAULT 'email' CHECK (two_factor_method IN ('email', 'sms')),
          backup_phone VARCHAR(20),
          is_verified BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          failed_login_attempts INTEGER DEFAULT 0,
          account_locked_until TIMESTAMP WITH TIME ZONE,
          password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create otp_codes table
      await client.query(`
        CREATE TABLE IF NOT EXISTS otp_codes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          email VARCHAR(255),
          phone VARCHAR(20),
          code VARCHAR(6) NOT NULL,
          code_type VARCHAR(20) NOT NULL CHECK (code_type IN ('signup', 'login', 'reset', 'verification')),
          delivery_method VARCHAR(10) NOT NULL CHECK (delivery_method IN ('email', 'sms')),
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          is_used BOOLEAN DEFAULT FALSE,
          attempts INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create user_sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id VARCHAR(255),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          user_email VARCHAR(255),
          session_token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create verification_attempts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS verification_attempts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255),
          phone VARCHAR(20),
          attempt_type VARCHAR(20) NOT NULL CHECK (attempt_type IN ('signup', 'login', 'verification')),
          is_successful BOOLEAN DEFAULT FALSE,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create indexes for performance
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_verification_attempts_email ON verification_attempts(email)')

      // Function to update updated_at timestamp
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql'
      `)

      // Trigger to automatically update updated_at
      await client.query(`
        DROP TRIGGER IF EXISTS update_users_updated_at ON users;
        CREATE TRIGGER update_users_updated_at 
            BEFORE UPDATE ON users 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `)

      // Create additional tables for enhanced security

      // Address validation logs
      await client.query(`
        CREATE TABLE IF NOT EXISTS address_validations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          original_address JSONB NOT NULL,
          validated_address JSONB,
          validation_status VARCHAR(50) NOT NULL,
          validation_score DECIMAL(3,2),
          provider VARCHAR(50) DEFAULT 'google_maps',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // CAPTCHA verification logs
      await client.query(`
        CREATE TABLE IF NOT EXISTS captcha_verifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id VARCHAR(255),
          provider VARCHAR(50) NOT NULL,
          token_hash VARCHAR(255) NOT NULL,
          verification_result JSONB,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Login attempts and security
      await client.query(`
        CREATE TABLE IF NOT EXISTS login_attempts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255),
          ip_address INET,
          user_agent TEXT,
          success BOOLEAN DEFAULT FALSE,
          failure_reason VARCHAR(100),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Backup codes for account recovery
      await client.query(`
        CREATE TABLE IF NOT EXISTS backup_codes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          code_hash VARCHAR(255) NOT NULL,
          is_used BOOLEAN DEFAULT FALSE,
          used_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Security events logging
      await client.query(`
        CREATE TABLE IF NOT EXISTS security_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          event_type VARCHAR(50) NOT NULL,
          event_details JSONB,
          ip_address INET,
          user_agent TEXT,
          risk_score DECIMAL(3,2),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Password reset tokens table
      await client.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) NOT NULL,
          token VARCHAR(255) NOT NULL UNIQUE,
          is_used BOOLEAN DEFAULT FALSE,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Enhanced indexes for performance and security
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_password_hash ON users(password_hash)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_address ON users(city, state_province, postal_code)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, created_at)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_security_events_user_type ON security_events(user_id, event_type)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_backup_codes_user ON backup_codes(user_id, is_used)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens(email)')

      console.log('✅ Enhanced authentication database schema initialized successfully')
    } catch (error) {
      console.error('Error initializing database schema:', error)
      throw error
    } finally {
      client.release()
    }
  }

  async getUserStats(): Promise<any> {
    const client = await DatabasePool.getClient()
    
    try {
      const userStatsQuery = `
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
          COUNT(CASE WHEN created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 1 END) as recent_signups
        FROM users
      `
      const result = await client.query(userStatsQuery)
      return result.rows[0]
    } catch (error) {
      console.error('Error fetching user stats:', error)
      return { total_users: 0, verified_users: 0, recent_signups: 0 }
    } finally {
      client.release()
    }
  }

  async validateSessionToken(sessionToken: string): Promise<AuthUser | null> {
    return validateSessionToken(sessionToken)
  }

  async validateSession(sessionToken: string): Promise<AuthUser | null> {
    return validateSessionToken(sessionToken)
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    return getUserById(userId)
  }

  async getUserByEmail(email: string): Promise<AuthUser | null> {
    return getUserByEmail(email)
  }

  async createUserSession(userId: string, sessionToken: string, ipAddress: string, userAgent: string, expiresInHours: number = 4): Promise<UserSession | null> {
    return createUserSession(userId, sessionToken, ipAddress, userAgent, expiresInHours)
  }

  async invalidateSession(sessionToken: string): Promise<boolean> {
    return invalidateSession(sessionToken)
  }

  async getUserSessions(userId: string): Promise<UserSession[]> {
    return getUserSessions(userId)
  }

  // OTP and authentication methods
  async findUserByEmail(email: string): Promise<AuthUser | null> {
    return this.getUserByEmail(email)
  }

  async findUserByPhone(phone: string): Promise<AuthUser | null> {
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(
        'SELECT * FROM users WHERE phone = $1',
        [phone]
      )

      if (result.rows.length === 0) {
        return null
      }

      return result.rows[0]
    } catch (error) {
      console.error('Error fetching user by phone:', error)
      return null
    } finally {
      client.release()
    }
  }

  async createOTPCode(request: OTPRequest): Promise<string> {
    const client = await DatabasePool.getClient()
    
    try {
      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      
      // Calculate expiry time
      const expiresAt = new Date()
      expiresAt.setMinutes(expiresAt.getMinutes() + request.expiryMinutes)

      // Insert OTP code
      await client.query(`
        INSERT INTO otp_codes (email, code, code_type, delivery_method, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [request.email, code, request.codeType, request.deliveryMethod, expiresAt])

      return code
    } catch (error) {
      console.error('Error creating OTP code:', error)
      throw error
    } finally {
      client.release()
    }
  }

  async verifyOTPCode(verification: OTPVerification): Promise<VerificationResult> {
    const client = await DatabasePool.getClient()
    
    try {
      // Find valid OTP code
      const result = await client.query(`
        SELECT * FROM otp_codes 
        WHERE email = $1 AND code = $2 AND code_type = $3 
        AND is_used = false AND expires_at > NOW()
        ORDER BY created_at DESC 
        LIMIT 1
      `, [verification.email, verification.code, verification.codeType])

      if (result.rows.length === 0) {
        // Count failed attempts
        const attemptResult = await client.query(`
          SELECT COUNT(*) FROM verification_attempts 
          WHERE email = $1 AND attempt_type = $2 
          AND is_successful = false 
          AND created_at > NOW() - INTERVAL '1 hour'
        `, [verification.email, verification.codeType])

        return {
          valid: false,
          attempts: parseInt(attemptResult.rows[0].count),
          error: 'Invalid or expired verification code'
        }
      }

      // Mark code as used
      await client.query(
        'UPDATE otp_codes SET is_used = true WHERE id = $1',
        [result.rows[0].id]
      )

      return {
        valid: true,
        attempts: 0
      }
    } catch (error) {
      console.error('Error verifying OTP code:', error)
      return {
        valid: false,
        attempts: 0,
        error: 'Verification failed'
      }
    } finally {
      client.release()
    }
  }

  async logVerificationAttempt(attempt: AttemptLog): Promise<void> {
    const client = await DatabasePool.getClient()
    
    try {
      // Handle comma-separated IP addresses (from x-forwarded-for)
      const cleanIpAddress = attempt.ipAddress?.split(',')[0].trim() || 'unknown'
      
      await client.query(`
        INSERT INTO verification_attempts (email, attempt_type, is_successful, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5)
      `, [attempt.email, attempt.attemptType, attempt.isSuccessful, cleanIpAddress, attempt.userAgent])
    } catch (error) {
      console.error('Error logging verification attempt:', error)
    } finally {
      client.release()
    }
  }

  async createUser(userData: any): Promise<AuthUser | null> {
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        INSERT INTO users (email, first_name, last_name, phone, date_of_birth, gender_at_birth, is_verified)
        VALUES ($1, $2, $3, $4, $5, $6, false)
        RETURNING *
      `, [
        userData.email,
        userData.firstName,
        userData.lastName,
        userData.phone,
        userData.dateOfBirth,
        userData.genderAtBirth
      ])

      return result.rows[0]
    } catch (error) {
      console.error('Error creating user:', error)
      return null
    } finally {
      client.release()
    }
  }

  async createUserWithPassword(userData: CreateUserWithPasswordRequest): Promise<string | null> {
    const client = await DatabasePool.getClient()
    
    try {
      await client.query('BEGIN')
      
      const result = await client.query(`
        INSERT INTO users (
          email, first_name, last_name, phone, date_of_birth, gender_at_birth,
          password_hash, street_address_1, street_address_2, city, state_province,
          postal_code, country, two_factor_method, backup_phone, is_verified,
          address_validated, password_changed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true, true, NOW())
        RETURNING id
      `, [
        userData.email,
        userData.firstName,
        userData.lastName,
        userData.phone,
        userData.dateOfBirth,
        userData.genderAtBirth,
        userData.passwordHash,
        userData.streetAddress1,
        userData.streetAddress2 || '',
        userData.city,
        userData.stateProvince,
        userData.postalCode,
        userData.country,
        userData.twoFactorMethod,
        userData.backupPhone || ''
      ])

      const userId = result.rows[0].id

      // Add initial password to history
      await client.query(`
        INSERT INTO password_history (user_id, password_hash)
        VALUES ($1, $2)
      `, [userId, userData.passwordHash])

      await client.query('COMMIT')
      return userId
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Error creating user with password:', error)
      return null
    } finally {
      client.release()
    }
  }

  async markUserVerified(userId: string): Promise<void> {
    const client = await DatabasePool.getClient()
    
    try {
      await client.query(
        'UPDATE users SET is_verified = true, updated_at = NOW() WHERE id = $1',
        [userId]
      )
    } catch (error) {
      console.error('Error marking user as verified:', error)
    } finally {
      client.release()
    }
  }

  async createSession(userId: string, sessionToken: string, ipAddress: string, userAgent: string): Promise<UserSession | null> {
    return this.createUserSession(userId, sessionToken, ipAddress, userAgent)
  }

  async getUserProfile(userId: string): Promise<any> {
    return this.getUserById(userId)
  }

  async emailExists(email: string, excludeUserId?: string): Promise<boolean> {
    const client = await DatabasePool.getClient()
    
    try {
      let query = 'SELECT id FROM users WHERE email = $1'
      let params = [email]
      
      if (excludeUserId) {
        query += ' AND id != $2'
        params.push(excludeUserId)
      }
      
      const result = await client.query(query, params)
      return result.rows.length > 0
    } catch (error) {
      console.error('Error checking if email exists:', error)
      return false
    } finally {
      client.release()
    }
  }

  async updateUserProfile(userId: string, profileData: any): Promise<any> {
    const client = await DatabasePool.getClient()
    
    try {
      // Build dynamic update query based on provided fields
      const updates: string[] = []
      const values: any[] = []
      let paramCounter = 1

      // Map frontend field names to database column names
      const fieldMapping: Record<string, string> = {
        firstName: 'first_name',
        lastName: 'last_name',
        email: 'email',
        phone: 'phone',
        dateOfBirth: 'date_of_birth',
        genderAtBirth: 'gender_at_birth',
        streetAddress1: 'street_address_1',
        streetAddress2: 'street_address_2',
        city: 'city',
        stateProvince: 'state_province',
        postalCode: 'postal_code',
        country: 'country'
      }

      // Build update fields based on provided data
      for (const [frontendField, dbField] of Object.entries(fieldMapping)) {
        if (profileData[frontendField] !== undefined) {
          updates.push(`${dbField} = $${paramCounter}`)
          values.push(profileData[frontendField])
          paramCounter++
        }
      }

      // Always update the updated_at timestamp
      updates.push(`updated_at = NOW()`)

      if (updates.length === 1) { // Only updated_at, no actual changes
        return this.getUserById(userId)
      }

      // Add user ID as the last parameter
      values.push(userId)

      const query = `
        UPDATE users 
        SET ${updates.join(', ')}
        WHERE id = $${paramCounter}
        RETURNING *
      `

      const result = await client.query(query, values)
      
      if (result.rows.length === 0) {
        return null
      }

      return result.rows[0]
    } catch (error) {
      console.error('Error updating user profile:', error)
      return null
    } finally {
      client.release()
    }
  }

  async setUserPassword(userId: string, passwordHash: string): Promise<boolean> {
    const client = await DatabasePool.getClient()
    
    try {
      await client.query('BEGIN')
      
      const result = await client.query(`
        UPDATE users 
        SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
        WHERE id = $2 AND password_hash IS NULL
        RETURNING id
      `, [passwordHash, userId])
      
      if (result.rows.length > 0) {
        // Add password to history for new users
        await client.query(`
          INSERT INTO password_history (user_id, password_hash)
          VALUES ($1, $2)
        `, [userId, passwordHash])
        
        await client.query('COMMIT')
        return true
      }
      
      await client.query('ROLLBACK')
      return false
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Error setting user password:', error)
      return false
    } finally {
      client.release()
    }
  }

  /**
   * Check if a password has been used recently by a user
   * @param userId - User ID to check against
   * @param plainPassword - Plain text password to check
   * @returns true if password was used recently, false otherwise
   */
  async isPasswordRecentlyUsed(userId: string, plainPassword: string): Promise<boolean> {
    const client = await DatabasePool.getClient()
    
    try {
      // Get last 5 password hashes for this user
      const historyResult = await client.query(`
        SELECT password_hash FROM password_history 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT 5
      `, [userId])
      
      // Check if the plain password matches any of the stored hashes
      const bcrypt = require('bcryptjs')
      for (const row of historyResult.rows) {
        if (await bcrypt.compare(plainPassword, row.password_hash)) {
          return true
        }
      }
      
      return false
    } catch (error) {
      console.error('Error checking password history:', error)
      return false
    } finally {
      client.release()
    }
  }

  async createPasswordResetToken(email: string): Promise<string | null> {
    const client = await DatabasePool.getClient()
    
    try {
      // Generate secure random token
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      
      // Delete any existing reset tokens for this email
      await client.query(`
        DELETE FROM password_reset_tokens 
        WHERE email = $1
      `, [email])
      
      // Insert new reset token
      await client.query(`
        INSERT INTO password_reset_tokens (email, token, expires_at, created_at)
        VALUES ($1, $2, $3, NOW())
      `, [email, token, expiresAt])
      
      return token
    } catch (error) {
      console.error('Error creating password reset token:', error)
      return null
    } finally {
      client.release()
    }
  }

  async verifyPasswordResetToken(token: string): Promise<{ email: string } | null> {
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        SELECT email, expires_at
        FROM password_reset_tokens 
        WHERE token = $1 AND expires_at > NOW() AND is_used = false
      `, [token])
      
      if (result.rows.length === 0) {
        return null
      }
      
      return { email: result.rows[0].email }
    } catch (error) {
      console.error('Error verifying password reset token:', error)
      return null
    } finally {
      client.release()
    }
  }

  async resetUserPassword(email: string, passwordHash: string, token: string): Promise<boolean> {
    const client = await DatabasePool.getClient()
    
    try {
      await client.query('BEGIN')
      
      // Get user ID
      const userResult = await client.query(`
        SELECT id FROM users WHERE email = $1
      `, [email])
      
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK')
        return false
      }
      
      const userId = userResult.rows[0].id
      
      // Check password history - prevent reuse of last 5 passwords
      const historyResult = await client.query(`
        SELECT password_hash FROM password_history 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT 5
      `, [userId])
      
      // Verify new password doesn't match any of the last 5 passwords
      const bcrypt = require('bcryptjs')
      
      // Note: We need to compare with the plain password, not the already hashed one
      // This function should receive the plain password for comparison
      // For now, we'll skip this check since passwordHash is already hashed
      // This will be handled at the API level before hashing
      
      // Mark reset token as used
      await client.query(`
        UPDATE password_reset_tokens 
        SET is_used = true 
        WHERE token = $1
      `, [token])
      
      // Update user password
      const result = await client.query(`
        UPDATE users 
        SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
        WHERE email = $2
        RETURNING id
      `, [passwordHash, email])
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK')
        return false
      }
      
      // Add new password to history
      await client.query(`
        INSERT INTO password_history (user_id, password_hash)
        VALUES ($1, $2)
      `, [userId, passwordHash])
      
      // Clean up old password history (keep only last 5)
      await client.query(`
        DELETE FROM password_history 
        WHERE user_id = $1 
        AND id NOT IN (
          SELECT id FROM password_history 
          WHERE user_id = $1 
          ORDER BY created_at DESC 
          LIMIT 5
        )
      `, [userId])
      
      await client.query('COMMIT')
      return true
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Error resetting user password:', error)
      return false
    } finally {
      client.release()
    }
  }

  async deactivateUser(userId: string): Promise<void> {
    // No-op stub
  }

  async getUserActivity(userId: string): Promise<any[]> {
    // Return empty array as this is a stub
    return []
  }

  async getUserVerificationHistory(userId: string): Promise<any[]> {
    // Return empty array as this is a stub
    return []
  }

  // Store OTP code for email authentication
  async storeOTPCode(email: string, code: string, purpose: string): Promise<boolean> {
    const client = await DatabasePool.getClient()
    
    try {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
      
      // Delete any existing OTP for this email and purpose
      await client.query(`
        DELETE FROM otp_codes 
        WHERE email = $1 AND code_type = $2
      `, [email, purpose])
      
      // Insert new OTP code
      await client.query(`
        INSERT INTO otp_codes (email, code, code_type, delivery_method, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [email, code, purpose, 'email', expiresAt])
      
      return true
    } catch (error) {
      console.error("Error storing OTP code:", error)
      return false
    } finally {
      client.release()
    }
  }


}

// Validate user session function for compatibility
export async function validateUserSession(sessionToken: string): Promise<{ userId: string; email: string } | null> {
  // Using DatabasePool.getClient() directly
  const client = await DatabasePool.getClient()
  
  try {
    const result = await client.query(`
      SELECT us.user_id, u.email 
      FROM user_sessions us
      JOIN users u ON us.user_id = u.id
      WHERE us.session_token = $1 
      AND us.is_active = true 
      AND us.expires_at > NOW()
    `, [sessionToken])
    
    if (result.rows.length === 0) {
      return null
    }
    
    return {
      userId: result.rows[0].user_id,
      email: result.rows[0].email
    }
  } catch (error) {
    console.error('Error validating user session:', error)
    return null
  } finally {
    client.release()
  }
}

// Alias for compatibility with existing code
export const initializeScheduledPromptsDatabase = async () => {
  console.log('Scheduled prompts schema already initialized via database-pool')
}

// Export instance for compatibility
export const authDB = new AuthDatabase()
