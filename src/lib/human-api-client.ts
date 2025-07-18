// Human API Client stub for compatibility
export class HumanAPIClient {
  constructor(apiKey: string) {
    // Stub implementation
  }

  async getLabResults(userId: string) {
    return []
  }

  async getPatientData(userId: string) {
    return null
  }
}

export default HumanAPIClient

// Create instance for export
export const humanApiClient = new HumanAPIClient('')