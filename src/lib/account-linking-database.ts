import { DatabasePool } from './database-pool';
import { v4 as uuidv4 } from 'uuid'

export interface AccountLink {
  id: string
  inviter_user_id: string
  inviter_email: string
  invitee_email: string
  invited_user_id?: string
  link_token: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  permissions: string[]
  created_at: string
  expires_at: string
  accepted_at?: string
  rejected_at?: string
}

export interface LinkedAccount {
  id: string
  user_id: string
  linked_user_id: string
  relationship_type: 'family' | 'healthcare_provider' | 'caregiver' | 'friend' | 'other'
  permissions: string[]
  created_at: string
  is_active: boolean
  inviter_email: string
  linked_email: string
}

export interface DataSharePermission {
  id: string
  link_id: string
  data_type: 'health_data' | 'wearables' | 'medications' | 'lab_results' | 'vitals' | 'all'
  read_permission: boolean
  write_permission: boolean
  created_at: string
}

export class AccountLinkingDatabase {
  
  /**
   * Initialize account linking database schema
   */
  static async initializeSchema(): Promise<void> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      console.log('🔗 Initializing account linking database schema...')
      
      // Account linking invitations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS account_link_invitations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          inviter_user_id UUID NOT NULL,
          inviter_email VARCHAR(255) NOT NULL,
          invitee_email VARCHAR(255) NOT NULL,
          invited_user_id UUID DEFAULT NULL,
          link_token VARCHAR(255) UNIQUE NOT NULL,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
          permissions JSONB DEFAULT '[]',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          accepted_at TIMESTAMP DEFAULT NULL,
          rejected_at TIMESTAMP DEFAULT NULL
        )
      `)
      
      // Linked accounts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS linked_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          linked_user_id UUID NOT NULL,
          relationship_type VARCHAR(50) DEFAULT 'other' CHECK (relationship_type IN ('family', 'healthcare_provider', 'caregiver', 'friend', 'other')),
          permissions JSONB DEFAULT '[]',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT TRUE,
          inviter_email VARCHAR(255),
          linked_email VARCHAR(255),
          UNIQUE(user_id, linked_user_id)
        )
      `)
      
      // Data sharing permissions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS data_share_permissions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          link_id UUID NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
          data_type VARCHAR(50) NOT NULL CHECK (data_type IN ('health_data', 'wearables', 'medications', 'lab_results', 'vitals', 'all')),
          read_permission BOOLEAN DEFAULT TRUE,
          write_permission BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      
      // Access logs table for security auditing
      await client.query(`
        CREATE TABLE IF NOT EXISTS account_access_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          requesting_user_email VARCHAR(255) NOT NULL,
          linked_account_id UUID,
          data_type VARCHAR(50),
          permission_used VARCHAR(50),
          access_granted BOOLEAN DEFAULT FALSE,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          ip_address INET,
          user_agent TEXT
        )
      `)
      
      // Create indexes
      await client.query('CREATE INDEX IF NOT EXISTS idx_invitations_token ON account_link_invitations(link_token)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_invitations_invitee ON account_link_invitations(invitee_email)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_linked_accounts_user ON linked_accounts(user_id)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_linked_accounts_linked_user ON linked_accounts(linked_user_id)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_permissions_link ON data_share_permissions(link_id)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_access_logs_user ON account_access_logs(requesting_user_email)')
      await client.query('CREATE INDEX IF NOT EXISTS idx_access_logs_linked_account ON account_access_logs(linked_account_id)')
      
      console.log('✅ Account linking database schema initialized successfully')
      
    } catch (error) {
      console.error('❌ Error initializing account linking schema:', error)
      throw error
    } finally {
      client.release()
    }
  }
  
  /**
   * Create a new account link invitation
   */
  static async createInvitation(
    inviterUserId: string,
    inviterEmail: string,
    inviteeEmail: string,
    relationshipType: string,
    permissions: string[],
    expiresInHours: number = 168 // 7 days default
  ): Promise<AccountLink> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      const linkToken = uuidv4()
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      
      const result = await client.query(`
        INSERT INTO account_link_invitations (
          inviter_user_id, inviter_email, invitee_email, link_token, permissions, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [inviterUserId, inviterEmail, inviteeEmail, linkToken, JSON.stringify(permissions), expiresAt])
      
      return result.rows[0]
    } finally {
      client.release()
    }
  }
  
  /**
   * Get invitation by token
   */
  static async getInvitationByToken(linkToken: string): Promise<AccountLink | null> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        SELECT * FROM account_link_invitations 
        WHERE link_token = $1 AND status = 'pending' AND expires_at > NOW()
      `, [linkToken])
      
      return result.rows[0] || null
    } finally {
      client.release()
    }
  }
  
  /**
   * Get pending invitations for a user (as invitee)
   */
  static async getPendingInvitations(userEmail: string): Promise<AccountLink[]> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        SELECT * FROM account_link_invitations 
        WHERE invitee_email = $1 AND status = 'pending' AND expires_at > NOW()
        ORDER BY created_at DESC
      `, [userEmail])
      
      return result.rows
    } finally {
      client.release()
    }
  }
  
  /**
   * Accept an invitation
   */
  static async acceptInvitation(linkToken: string, acceptingUserId: string, accepteePermissions: string[] = []): Promise<LinkedAccount> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      await client.query('BEGIN')
      
      // Update invitation status
      const inviteResult = await client.query(`
        UPDATE account_link_invitations 
        SET status = 'accepted', accepted_at = NOW(), invited_user_id = $1
        WHERE link_token = $2 AND status = 'pending' AND expires_at > NOW()
        RETURNING *
      `, [acceptingUserId, linkToken])
      
      if (inviteResult.rows.length === 0) {
        throw new Error('Invitation not found or expired')
      }
      
      const invitation = inviteResult.rows[0]
      
      // Create directional linked accounts
      // Inviter keeps their original permissions to share with acceptee
      const inviterPermissionsJson = typeof invitation.permissions === 'string' ? invitation.permissions : JSON.stringify(invitation.permissions)
      // Acceptee gets their own choice of permissions to share back (can be empty)
      const accepteePermissionsJson = JSON.stringify(accepteePermissions)
      
      // Link 1: Inviter can access acceptee's data based on acceptee's permissions
      const linkResult1 = await client.query(`
        INSERT INTO linked_accounts (
          user_id, linked_user_id, relationship_type, permissions, inviter_email, linked_email
        ) VALUES ($1, $2, 'other', $3, $4, $5)
        ON CONFLICT (user_id, linked_user_id) DO UPDATE SET 
          is_active = TRUE, permissions = $3
        RETURNING *
      `, [invitation.inviter_user_id, acceptingUserId, accepteePermissionsJson, invitation.inviter_email, invitation.invitee_email])
      
      // Link 2: Acceptee can access inviter's data based on inviter's original permissions
      const linkResult2 = await client.query(`
        INSERT INTO linked_accounts (
          user_id, linked_user_id, relationship_type, permissions, inviter_email, linked_email
        ) VALUES ($1, $2, 'other', $3, $4, $5)
        ON CONFLICT (user_id, linked_user_id) DO UPDATE SET 
          is_active = TRUE, permissions = $3
        RETURNING *
      `, [acceptingUserId, invitation.inviter_user_id, inviterPermissionsJson, invitation.invitee_email, invitation.inviter_email])
      
      await client.query('COMMIT')
      
      return linkResult1.rows[0]
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  
  /**
   * Reject an invitation
   */
  static async rejectInvitation(linkToken: string): Promise<boolean> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        UPDATE account_link_invitations 
        SET status = 'rejected', rejected_at = NOW()
        WHERE link_token = $1 AND status = 'pending'
        RETURNING *
      `, [linkToken])
      
      return result.rows.length > 0
    } finally {
      client.release()
    }
  }
  
  /**
   * Get linked accounts for a user
   */
  static async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        SELECT * FROM linked_accounts 
        WHERE user_id = $1 AND is_active = TRUE
        ORDER BY created_at DESC
      `, [userId])
      
      return result.rows
    } finally {
      client.release()
    }
  }
  
  /**
   * Check if user has permission to access another user's data
   */
  static async hasPermission(
    requestingUserId: string,
    targetUserId: string,
    dataType: string
  ): Promise<boolean> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        SELECT la.permissions, dsp.read_permission
        FROM linked_accounts la
        LEFT JOIN data_share_permissions dsp ON la.id = dsp.link_id AND dsp.data_type = $3
        WHERE la.user_id = $1 AND la.linked_user_id = $2 AND la.is_active = TRUE
      `, [requestingUserId, targetUserId, dataType])
      
      if (result.rows.length === 0) return false
      
      const row = result.rows[0]
      const permissions = JSON.parse(row.permissions || '[]')
      
      // Check if user has general permission or specific read permission
      return permissions.includes(dataType) || permissions.includes('all') || row.read_permission === true
    } finally {
      client.release()
    }
  }
  
  /**
   * Remove account link
   */
  static async removeLink(userId: string, linkedUserId: string): Promise<boolean> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      await client.query('BEGIN')
      
      // Deactivate both directions of the link
      await client.query(`
        UPDATE linked_accounts 
        SET is_active = FALSE 
        WHERE (user_id = $1 AND linked_user_id = $2) OR (user_id = $2 AND linked_user_id = $1)
      `, [userId, linkedUserId])
      
      await client.query('COMMIT')
      return true
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  
  /**
   * Get sent invitations for a user
   */
  static async getSentInvitations(userId: string): Promise<AccountLink[]> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        SELECT * FROM account_link_invitations 
        WHERE inviter_user_id = $1
        ORDER BY created_at DESC
      `, [userId])
      
      return result.rows
    } finally {
      client.release()
    }
  }
  
  /**
   * Clean up expired invitations
   */
  static async cleanupExpiredInvitations(): Promise<number> {
    // Using DatabasePool.getClient() directly
    const client = await DatabasePool.getClient()
    
    try {
      const result = await client.query(`
        UPDATE account_link_invitations 
        SET status = 'expired' 
        WHERE status = 'pending' AND expires_at < NOW()
        RETURNING *
      `)
      
      return result.rows.length
    } finally {
      client.release()
    }
  }

  /**
   * Share a prompt with a user (compatibility function)
   */
  static async sharePromptWithUser(promptId: string, sharedByUserId: string, sharedWithUserId: string, permissions: any): Promise<void> {
    console.log('sharePromptWithUser called but not implemented in current schema')
    // This is a placeholder for compatibility - actual implementation would need prompt sharing schema
  }
}

// Export static methods for compatibility
export const getLinkedAccounts = AccountLinkingDatabase.getLinkedAccounts

// Initialize schema on import
AccountLinkingDatabase.initializeSchema().catch(console.error)