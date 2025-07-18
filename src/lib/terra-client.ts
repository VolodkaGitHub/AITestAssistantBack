/**
 * Terra Client - Wrapper for Terra API Service
 * Provides backward compatibility for existing imports
 */

import { TerraAPIService } from './terra-api-service';

// DEPRECATED: Use terra-api-service.ts instead
// This file will be removed in next cleanup

// Create a singleton instance for backward compatibility
export const terraClient = new TerraAPIService();

// Re-export types for convenience
export type {
  TerraUser,
  TerraDataPoint,
  TerraActivityData,
  TerraSleepData,
  TerraHeartRateData,
  TerraBodyData
} from './terra-api-service';