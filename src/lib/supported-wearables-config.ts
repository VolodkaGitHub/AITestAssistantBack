/**
 * Configuration for supported wearable devices
 * Only these 4 providers have complete API integration
 */

export const SUPPORTED_WEARABLES = [
  'GOOGLE',    // Google Fit
  'SAMSUNG',   // Samsung Health
  'APPLE',     // Apple Watch/Health
  'OURA'       // Oura Ring
] as const;

export type SupportedWearableProvider = typeof SUPPORTED_WEARABLES[number];

/**
 * Check if a wearable provider is supported
 */
export function isWearableSupported(provider: string): boolean {
  return SUPPORTED_WEARABLES.includes(provider as SupportedWearableProvider);
}

/**
 * Get the reason why a wearable is not supported
 */
export function getUnsupportedReason(provider: string): string {
  if (isWearableSupported(provider)) {
    return '';
  }
  
  return 'API integration not available';
}

/**
 * Provider display names for supported devices
 */
export const SUPPORTED_PROVIDER_NAMES = {
  GOOGLE: 'Google Fit',
  SAMSUNG: 'Samsung Health',
  APPLE: 'Apple Watch', 
  OURA: 'Oura Ring'
} as const;