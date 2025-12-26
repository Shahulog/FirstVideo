/**
 * Audio Utilities
 * 
 * dB to gain conversion and clamping utilities.
 */

// Default values for BGM
export const DEFAULT_BASE_DB = -12;
export const DEFAULT_DUCK_DELTA_DB = -8;

// Clamp ranges
export const VOLUME_DB_MIN = -60;
export const VOLUME_DB_MAX = 6;
export const DUCK_DELTA_DB_MIN = -60;
export const DUCK_DELTA_DB_MAX = 0;

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Convert decibels to linear gain
 * Formula: gain = 10^(dB/20)
 * 
 * Examples:
 *   0 dB  -> 1.0
 *  -6 dB  -> 0.5
 * -12 dB  -> 0.25
 * -20 dB  -> 0.1
 * -60 dB  -> 0.001
 */
export function dbToGain(db: number): number {
  // Clamp to prevent extreme values
  const clampedDb = clamp(db, VOLUME_DB_MIN, VOLUME_DB_MAX);
  return Math.pow(10, clampedDb / 20);
}

/**
 * Convert linear gain to decibels
 * Formula: dB = 20 * log10(gain)
 * 
 * Returns -60 for gain <= 0 to avoid -Infinity
 */
export function gainToDb(gain: number): number {
  if (gain <= 0) return VOLUME_DB_MIN;
  return 20 * Math.log10(gain);
}

