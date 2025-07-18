// Auto-initialization for Terra Database Infrastructure
import TerraDataBaseSetup from '../../lib/terra-database-setup'

let isInitialized = false
let initializationPromise: Promise<void> | null = null

/**
 * Auto-initialize Terra database infrastructure on application startup
 * This ensures all necessary tables, indexes, and data are ready for 90+ devices
 */
export async function autoInitializeTerra(): Promise<void> {
  // Prevent multiple initialization attempts
  if (isInitialized) {
    console.log('✅ Terra database already initialized')
    return
  }

  if (initializationPromise) {
    console.log('⏳ Terra database initialization in progress...')
    return initializationPromise
  }

  initializationPromise = (async () => {
    try {
      console.log('🚀 Auto-initializing Terra database infrastructure...')
      
      // Initialize complete database infrastructure
      await TerraDataBaseSetup.initializeComplete()
      
      isInitialized = true
      console.log('✅ Terra database auto-initialization completed successfully')
      
    } catch (error) {
      console.error('❌ Terra database auto-initialization failed:', error)
      // Reset state to allow retry
      isInitialized = false
      initializationPromise = null
      throw error
    }
  })()

  return initializationPromise
}

/**
 * Check if Terra database is initialized
 */
export function isTerraInitialized(): boolean {
  return isInitialized
}

/**
 * Reset initialization state (for testing or manual re-initialization)
 */
export function resetTerraInitialization(): void {
  isInitialized = false
  initializationPromise = null
  console.log('🔄 Terra initialization state reset')
}