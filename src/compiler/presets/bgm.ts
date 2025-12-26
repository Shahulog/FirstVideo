/**
 * BGM Presets
 * 
 * Pre-configured BGM settings for common use cases.
 * These provide sensible defaults that can be overridden.
 */

import type { BgmConfig, BgmDuckingConfig } from "../../../spec/script.schema";

// ============================================================
// Default Constants (exported for use elsewhere)
// ============================================================

export const DEFAULT_BASE_DB = -12;
export const DEFAULT_MAX_GAIN_DB = -3;
export const DEFAULT_IDLE_BOOST_DB = 3;
export const DEFAULT_DUCK_DELTA_DB = -8;
export const DEFAULT_ATTACK_SEC = 0.10;
export const DEFAULT_RELEASE_SEC = 0.25;
export const DEFAULT_MERGE_GAP_SEC = 0.35;
export const DEFAULT_MIN_HOLD_SEC = 0.60;
export const DEFAULT_LOOP_CROSSFADE_SEC = 0.25;
export const DEFAULT_FADE_IN_SEC = 1.0;
export const DEFAULT_FADE_OUT_SEC = 1.0;
export const DEFAULT_TRANSITION_SEC = 1.0;

// ============================================================
// Preset Definitions
// ============================================================

/**
 * Resolved BGM configuration (all values explicitly set)
 */
export interface ResolvedBgmConfig {
  src: string;
  volumeDb: number;
  maxGainDb: number;
  fadeInSec: number;
  fadeOutSec: number;
  loop: boolean;
  loopStartSec?: number;
  loopEndSec?: number;
  loopCrossfadeSec: number;
  idleBoostDb: number;
  ducking: {
    enabled: boolean;
    duckDeltaDb: number;
    attackSec: number;
    releaseSec: number;
    mergeGapSec: number;
    minHoldSec: number;
  };
}

/**
 * Preset partial configuration (for merging)
 */
type PresetConfig = Partial<Omit<ResolvedBgmConfig, "src" | "ducking">> & {
  ducking?: Partial<ResolvedBgmConfig["ducking"]>;
};

/**
 * BGM Preset definitions
 */
export const BGM_PRESETS: Record<string, PresetConfig> = {
  /**
   * talk: Optimized for dialogue-heavy content (default)
   * - Standard ducking with anti-wobble
   * - Moderate idle boost
   */
  talk: {
    volumeDb: DEFAULT_BASE_DB,
    maxGainDb: DEFAULT_MAX_GAIN_DB,
    idleBoostDb: DEFAULT_IDLE_BOOST_DB,
    ducking: {
      enabled: true,
      duckDeltaDb: DEFAULT_DUCK_DELTA_DB,
      attackSec: DEFAULT_ATTACK_SEC,
      releaseSec: DEFAULT_RELEASE_SEC,
      mergeGapSec: DEFAULT_MERGE_GAP_SEC,
      minHoldSec: DEFAULT_MIN_HOLD_SEC,
    },
  },

  /**
   * calm: Softer ducking for ambient/chill content
   * - Gentler volume reduction
   * - Slower transitions
   */
  calm: {
    volumeDb: -16,
    maxGainDb: -6,
    idleBoostDb: 2,
    ducking: {
      enabled: true,
      duckDeltaDb: -6,
      attackSec: 0.15,
      releaseSec: 0.35,
      mergeGapSec: 0.5,
      minHoldSec: 0.8,
    },
  },

  /**
   * hype: Aggressive ducking for energetic content
   * - Louder base volume
   * - Stronger ducking
   * - Faster transitions
   */
  hype: {
    volumeDb: -10,
    maxGainDb: -2,
    idleBoostDb: 4,
    ducking: {
      enabled: true,
      duckDeltaDb: -10,
      attackSec: 0.08,
      releaseSec: 0.18,
      mergeGapSec: 0.25,
      minHoldSec: 0.4,
    },
  },

  /**
   * none: BGM disabled (ducking disabled, effectively silent)
   */
  none: {
    volumeDb: -60,
    idleBoostDb: 0,
    ducking: {
      enabled: false,
      duckDeltaDb: 0,
    },
  },
};

/**
 * Get default BGM configuration (all values set to defaults)
 */
function getDefaultBgmConfig(): Omit<ResolvedBgmConfig, "src"> {
  return {
    volumeDb: DEFAULT_BASE_DB,
    maxGainDb: DEFAULT_MAX_GAIN_DB,
    fadeInSec: DEFAULT_FADE_IN_SEC,
    fadeOutSec: DEFAULT_FADE_OUT_SEC,
    loop: true,
    loopCrossfadeSec: DEFAULT_LOOP_CROSSFADE_SEC,
    idleBoostDb: DEFAULT_IDLE_BOOST_DB,
    ducking: {
      enabled: true,
      duckDeltaDb: DEFAULT_DUCK_DELTA_DB,
      attackSec: DEFAULT_ATTACK_SEC,
      releaseSec: DEFAULT_RELEASE_SEC,
      mergeGapSec: DEFAULT_MERGE_GAP_SEC,
      minHoldSec: DEFAULT_MIN_HOLD_SEC,
    },
  };
}

/**
 * Deep merge two objects (for config merging)
 */
function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  
  for (const key in override) {
    const overrideValue = override[key];
    if (overrideValue === undefined) continue;
    
    const baseValue = result[key];
    
    if (
      typeof baseValue === "object" &&
      baseValue !== null &&
      typeof overrideValue === "object" &&
      overrideValue !== null &&
      !Array.isArray(baseValue) &&
      !Array.isArray(overrideValue)
    ) {
      // Recursively merge objects
      (result as Record<string, unknown>)[key] = deepMerge(
        baseValue as Record<string, unknown>,
        overrideValue as Record<string, unknown>
      );
    } else {
      (result as Record<string, unknown>)[key] = overrideValue;
    }
  }
  
  return result;
}

/**
 * Resolve BGM configuration by applying preset and overrides
 * 
 * Priority order:
 * 1. Scene override (highest)
 * 2. Video BGM explicit values
 * 3. Preset defaults
 * 4. Global defaults (lowest)
 * 
 * @param videoBgm - video.bgm from script
 * @param sceneOverride - scene.style.bgm override (optional)
 * @returns Fully resolved BGM configuration
 */
export function resolveBgmConfig(
  videoBgm: BgmConfig,
  sceneOverride?: Partial<BgmConfig>
): ResolvedBgmConfig {
  // Start with defaults
  let config = getDefaultBgmConfig();
  
  // Apply preset if specified
  const presetName = sceneOverride?.preset ?? videoBgm.preset;
  if (presetName && presetName in BGM_PRESETS) {
    const preset = BGM_PRESETS[presetName];
    config = deepMerge(config, preset as Partial<typeof config>);
  }
  
  // Apply video.bgm explicit values
  const videoBgmPartial: Partial<typeof config> = {
    ...(videoBgm.volumeDb !== undefined && { volumeDb: videoBgm.volumeDb }),
    ...(videoBgm.volume !== undefined && { volumeDb: undefined }), // Will handle volume separately
    ...(videoBgm.maxGainDb !== undefined && { maxGainDb: videoBgm.maxGainDb }),
    ...(videoBgm.fadeInSec !== undefined && { fadeInSec: videoBgm.fadeInSec }),
    ...(videoBgm.fadeOutSec !== undefined && { fadeOutSec: videoBgm.fadeOutSec }),
    ...(videoBgm.loop !== undefined && { loop: videoBgm.loop }),
    ...(videoBgm.loopStartSec !== undefined && { loopStartSec: videoBgm.loopStartSec }),
    ...(videoBgm.loopEndSec !== undefined && { loopEndSec: videoBgm.loopEndSec }),
    ...(videoBgm.loopCrossfadeSec !== undefined && { loopCrossfadeSec: videoBgm.loopCrossfadeSec }),
    ...(videoBgm.idleBoostDb !== undefined && { idleBoostDb: videoBgm.idleBoostDb }),
  };
  
  config = deepMerge(config, videoBgmPartial);
  
  // Apply video.bgm.ducking
  if (videoBgm.ducking) {
    const duckingPartial: Partial<typeof config.ducking> = {
      ...(videoBgm.ducking.enabled !== undefined && { enabled: videoBgm.ducking.enabled }),
      ...(videoBgm.ducking.duckDeltaDb !== undefined && { duckDeltaDb: videoBgm.ducking.duckDeltaDb }),
      ...(videoBgm.ducking.attackSec !== undefined && { attackSec: videoBgm.ducking.attackSec }),
      ...(videoBgm.ducking.releaseSec !== undefined && { releaseSec: videoBgm.ducking.releaseSec }),
      ...(videoBgm.ducking.mergeGapSec !== undefined && { mergeGapSec: videoBgm.ducking.mergeGapSec }),
      ...(videoBgm.ducking.minHoldSec !== undefined && { minHoldSec: videoBgm.ducking.minHoldSec }),
    };
    config.ducking = deepMerge(config.ducking, duckingPartial);
  }
  
  // Apply scene override
  if (sceneOverride) {
    const scenePartial: Partial<typeof config> = {
      ...(sceneOverride.volumeDb !== undefined && { volumeDb: sceneOverride.volumeDb }),
      ...(sceneOverride.maxGainDb !== undefined && { maxGainDb: sceneOverride.maxGainDb }),
      ...(sceneOverride.fadeInSec !== undefined && { fadeInSec: sceneOverride.fadeInSec }),
      ...(sceneOverride.fadeOutSec !== undefined && { fadeOutSec: sceneOverride.fadeOutSec }),
      ...(sceneOverride.loop !== undefined && { loop: sceneOverride.loop }),
      ...(sceneOverride.loopStartSec !== undefined && { loopStartSec: sceneOverride.loopStartSec }),
      ...(sceneOverride.loopEndSec !== undefined && { loopEndSec: sceneOverride.loopEndSec }),
      ...(sceneOverride.loopCrossfadeSec !== undefined && { loopCrossfadeSec: sceneOverride.loopCrossfadeSec }),
      ...(sceneOverride.idleBoostDb !== undefined && { idleBoostDb: sceneOverride.idleBoostDb }),
    };
    config = deepMerge(config, scenePartial);
    
    if (sceneOverride.ducking) {
      const duckingPartial: Partial<typeof config.ducking> = {
        ...(sceneOverride.ducking.enabled !== undefined && { enabled: sceneOverride.ducking.enabled }),
        ...(sceneOverride.ducking.duckDeltaDb !== undefined && { duckDeltaDb: sceneOverride.ducking.duckDeltaDb }),
        ...(sceneOverride.ducking.attackSec !== undefined && { attackSec: sceneOverride.ducking.attackSec }),
        ...(sceneOverride.ducking.releaseSec !== undefined && { releaseSec: sceneOverride.ducking.releaseSec }),
        ...(sceneOverride.ducking.mergeGapSec !== undefined && { mergeGapSec: sceneOverride.ducking.mergeGapSec }),
        ...(sceneOverride.ducking.minHoldSec !== undefined && { minHoldSec: sceneOverride.ducking.minHoldSec }),
      };
      config.ducking = deepMerge(config.ducking, duckingPartial);
    }
  }
  
  // Determine final src (scene override > video bgm)
  const src = sceneOverride?.src ?? videoBgm.src;
  
  return {
    src,
    ...config,
  };
}

/**
 * Generate a unique asset ID for a BGM source
 */
export function generateBgmAssetId(src: string): string {
  // Simple hash based on src string
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    const char = src.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `bgm_${Math.abs(hash).toString(16)}`;
}

