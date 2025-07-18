import { Activity, Heart, Pill, FileText, Calendar, Zap } from 'lucide-react'
import { MentionOption } from '@/components/EnhancedMentionDropdown'

interface LinkedAccount {
  id: string
  linked_user_email: string
  first_name?: string
  last_name?: string
  relationship_type: string
  permissions: string[]
  created_at: string
}

interface LinkedMentionData {
  type: string
  summary: string
  data: any
  timestamp: string
  sourceUser: string
  sourceUserName: string
  permission: string
}

export class LinkedMentionService {
  private sessionToken: string

  constructor(sessionToken: string) {
    this.sessionToken = sessionToken
  }

  /**
   * Get all linked accounts that can be mentioned
   */
  async getLinkedAccountOptions(): Promise<MentionOption[]> {
    console.log('🔗 LinkedMentionService: Fetching linked accounts with token:', this.sessionToken?.substring(0, 10) + '...')

    try {
      const response = await fetch('/api/accounts/linked', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json'
        }
      })

      console.log('🔗 LinkedMentionService: Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Failed to fetch linked accounts:', errorText)
        return []
      }

      const responseData = await response.json()
      // Handle both old and new API response formats
      const linkedAccounts = responseData.linkedAccounts || responseData.data?.linked_accounts || []
      console.log('🔗 LinkedMentionService: Received data:', responseData)

      console.log('🔗 LinkedMentionService: Processing', linkedAccounts?.length || 0, 'linked accounts')

      return linkedAccounts.map((account: any) => ({
        id: `user-${account.id}`,
        label: account.linked_user_email,
        icon: 'User', // Will be resolved in the component
        description: `Access ${account.linked_user_email}'s health data`,
        dataType: 'linked-user' as any,
        linkedAccountId: account.id,
        linkedAccountData: account
      }))
    } catch (error) {
      console.error('🔗 LinkedMentionService: Error fetching linked accounts:', error)
      console.error('🔗 LinkedMentionService: Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error
      })
      return []
    }
  }

  async getLinkedAccountWearablesData(linkedAccountId: string): Promise<any> {
    console.log('🔗 LinkedMentionService: Fetching wearables data for linked account:', linkedAccountId)

    // try {
    //   const response = await fetch(`${this.baseUrl}/api/linked-accounts/wearables?linkedAccountId=${linkedAccountId}`, {
    //     method: 'GET',
    //     headers: {
    //       'Authorization': `Bearer ${this.sessionToken}`,
    //       'Content-Type': 'application/json'
    //     }
    //   })

    //   if (!response.ok) {
    //     throw new Error(`HTTP error! status: ${response.status}`)
    //   }

    //   const data = await response.json()
    //   return data.data || null

    // } catch (error) {
    //   console.error('🔗 LinkedMentionService: Error fetching wearables data:', error)
    //   return null
    // }

    return null
  }

  /**
   * Get data types available for a specific linked user
   */
  async getDataTypesForLinkedUser(linkedAccountId: string): Promise<MentionOption[]> {
    try {
      // First verify we have access to this linked account
      const linkedAccounts = await this.getLinkedAccountOptions()
      const linkedAccount = linkedAccounts.find(acc => acc.id === `user-${linkedAccountId}`)

      if (!linkedAccount) {
        console.error('Linked account not found or no access')
        return []
      }

      const account = linkedAccount.linkedAccountData
      const permissions = account.permissions

      // Return available data types based on permissions
      const availableDataTypes: MentionOption[] = []

      if (permissions.includes('wearables') || permissions.includes('all_data')) {
        availableDataTypes.push({
          id: `${linkedAccountId}-wearables`,
          label: 'Wearable Devices Data',
          icon: Activity,
          description: `${account.first_name || account.linked_user_email}'s last 7 days of daily health scores (sleep, stress, respiratory)`,
          dataType: 'wearable',
          linkedAccountId
        })
      }

      if (permissions.includes('medications') || permissions.includes('all_data')) {
        availableDataTypes.push({
          id: `${linkedAccountId}-medications`,
          label: 'Medications',
          icon: Pill,
          description: `${account.first_name || account.linked_user_email}'s current medications`,
          dataType: 'medical',
          linkedAccountId
        })
      }

      if (permissions.includes('lab_results') || permissions.includes('all_data')) {
        availableDataTypes.push({
          id: `${linkedAccountId}-lab_results`,
          label: 'Lab Results',
          icon: FileText,
          description: `${account.first_name || account.linked_user_email}'s latest lab results`,
          dataType: 'medical',
          linkedAccountId
        })
      }

      if (permissions.includes('health_data') || permissions.includes('all_data')) {
        availableDataTypes.push(
          {
            id: `${linkedAccountId}-health_timeline`,
            label: 'Health Timeline',
            icon: Calendar,
            description: `${account.first_name || account.linked_user_email}'s recent health events`,
            dataType: 'health',
            linkedAccountId
          },
          {
            id: `${linkedAccountId}-vitals`,
            label: 'Vitals',
            icon: Zap,
            description: `${account.first_name || account.linked_user_email}'s vital signs`,
            dataType: 'health',
            linkedAccountId
          }
        )
      }

      return availableDataTypes
    } catch (error) {
      console.error('Error fetching data types for linked user:', error)
      return []
    }
  }

  /**
   * Fetch data from a linked user with permission validation
   */
  async fetchLinkedUserData(linkedAccountId: string, dataType: string): Promise<LinkedMentionData | null> {
    try {
      console.log(`🔗 Fetching ${dataType} data for linked account: ${linkedAccountId}`)

      // Validate permissions first
      const hasPermission = await this.validateDataAccess(linkedAccountId, dataType)
      if (!hasPermission) {
        console.error('Permission denied for accessing linked user data')
        return null
      }

      // Get linked account details
      const linkedAccounts = await this.getLinkedAccountOptions()
      const linkedAccount = linkedAccounts.find(acc => acc.id === `user-${linkedAccountId}`)

      if (!linkedAccount) {
        console.error('Linked account not found')
        return null
      }

      const account = linkedAccount.linkedAccountData

      // Fetch the actual data through dedicated endpoint based on data type
      let apiEndpoint = '/api/accounts/shared-data-new'

      // Use specific API endpoints for better reliability
      if (dataType === 'medications') {
        apiEndpoint = '/api/linked-accounts/medications'
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          linkedAccountId,
          dataType,
          requestedBy: 'current_user' // Will be validated server-side
        })
      })

      if (!response.ok) {
        console.error('Failed to fetch linked user data:', response.statusText)
        return null
      }

      const data = await response.json()

      return {
        type: dataType,
        summary: data.summary || `${account.first_name || account.linked_user_email}'s ${dataType}`,
        data: data.data,
        timestamp: new Date().toISOString(),
        sourceUser: account.linked_user_email,
        sourceUserName: this.getDisplayName(account),
        permission: this.getRequiredPermission(dataType)
      }
    } catch (error) {
      console.error('Error fetching linked user data:', error)
      return null
    }
  }

  /**
   * Validate if current user has permission to access linked user's data
   */
  private async validateDataAccess(linkedAccountId: string, dataType: string): Promise<boolean> {
    try {
      const response = await fetch('/api/accounts/validate-access', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          linkedAccountId,
          dataType,
          requiredPermission: this.getRequiredPermission(dataType)
        })
      })

      return response.ok
    } catch (error) {
      console.error('Error validating data access:', error)
      return false
    }
  }

  /**
   * Get required permission for a data type
   */
  private getRequiredPermission(dataType: string): string {
    const permissionMap: { [key: string]: string } = {
      'oura': 'wearables',
      'googlefit': 'wearables',
      'wearables': 'wearables',
      'medications': 'medications',
      'lab_results': 'lab_results',
      'health_timeline': 'health_data',
      'vitals': 'vitals'
    }

    return permissionMap[dataType] || 'all_data'
  }

  /**
   * Get display name for linked account
   */
  private getDisplayName(account: LinkedAccount): string {
    if (account.first_name && account.last_name) {
      return `${account.first_name} ${account.last_name}`
    } else if (account.first_name) {
      return account.first_name
    } else {
      return account.linked_user_email.split('@')[0]
    }
  }

  /**
   * Parse @mention input to detect linked user mentions
   * Format: @PersonName @DataType or @person.datatype
   */
  static parseLinkedMention(text: string, cursorPos: number): {
    isLinkedMention: boolean
    personPart?: string
    dataPart?: string
    startPos: number
    endPos: number
  } {
    // Look for @Person @Data pattern
    const beforeCursor = text.substring(0, cursorPos)
    const afterCursor = text.substring(cursorPos)

    // Pattern 1: @PersonName @DataType
    const doubleAtMatch = beforeCursor.match(/@(\w+)\s+@(\w*)$/)
    if (doubleAtMatch) {
      return {
        isLinkedMention: true,
        personPart: doubleAtMatch[1],
        dataPart: doubleAtMatch[2],
        startPos: beforeCursor.lastIndexOf('@'),
        endPos: cursorPos
      }
    }

    // Pattern 2: @person.datatype
    const dotNotationMatch = beforeCursor.match(/@(\w+)\.(\w*)$/)
    if (dotNotationMatch) {
      return {
        isLinkedMention: true,
        personPart: dotNotationMatch[1],
        dataPart: dotNotationMatch[2],
        startPos: beforeCursor.lastIndexOf('@'),
        endPos: cursorPos
      }
    }

    // Pattern 3: Just @PersonName (show available data types)
    const personOnlyMatch = beforeCursor.match(/@(\w+)$/)
    if (personOnlyMatch) {
      // Check if this could be a person name vs data type
      const personPart = personOnlyMatch[1].toLowerCase()
      const commonDataTypes = ['oura', 'googlefit', 'medications', 'labs', 'timeline', 'vitals']

      if (!commonDataTypes.includes(personPart)) {
        return {
          isLinkedMention: true,
          personPart: personOnlyMatch[1],
          dataPart: '',
          startPos: beforeCursor.lastIndexOf('@'),
          endPos: cursorPos
        }
      }
    }

    return {
      isLinkedMention: false,
      startPos: -1,
      endPos: -1
    }
  }
}

export default LinkedMentionService