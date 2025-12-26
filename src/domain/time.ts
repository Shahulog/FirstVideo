/**
 * Time Utilities
 * 
 * Conversion between seconds and frames.
 * All frame calculations use Math.ceil to ensure we never cut off audio.
 */

/**
 * Convert seconds to frames (ceil to ensure audio is not cut off)
 */
export function secToFrames(sec: number, fps: number): number {
  return Math.ceil(sec * fps);
}

/**
 * Convert frames to seconds
 */
export function framesToSec(frames: number, fps: number): number {
  return frames / fps;
}

