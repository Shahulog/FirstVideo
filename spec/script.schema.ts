/**
 * Script Schema v0.1
 * 
 * Script represents the human-authored intent layer.
 * It describes WHAT should happen, not HOW it renders.
 */
import { z } from "zod";

// Voice configuration for VOICEVOX
export const voiceConfigSchema = z.object({
  engine: z.literal("voicevox"),
  speakerId: z.number().int().nonnegative(),
});

// Cast member definition
export const castMemberSchema = z.object({
  voice: voiceConfigSchema,
  assets: z.object({
    baseDir: z.string().optional(),
  }).optional(),
});

// ============================================================
// BGM Configuration (Pro Quality)
// ============================================================

/**
 * BGM Preset names
 * - talk: Optimized for dialogue-heavy content (default)
 * - calm: Softer ducking for ambient/chill content
 * - hype: Aggressive ducking for energetic content
 * - none: BGM disabled
 */
export const bgmPresetSchema = z.enum(["talk", "calm", "hype", "none"]).optional();

/**
 * BGM ducking configuration with stabilization (anti-wobble)
 * Priority order for ducking: duckDeltaDb > duckVolumeDb > duckVolume
 */
export const bgmDuckingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  
  /** 
   * Relative dB reduction during dialogue (usually negative, e.g. -8)
   * Priority 1 (HIGHEST): Applied as baseGain * 10^(duckDeltaDb/20)
   */
  duckDeltaDb: z.number().min(-60).max(0).optional(),
  
  /**
   * Absolute dB level during dialogue (e.g. -20)
   * Priority 2: Applied as 10^(duckVolumeDb/20)
   */
  duckVolumeDb: z.number().min(-60).max(6).optional(),
  
  /** 
   * Volume multiplier during dialogue (0.0-1.0)
   * Priority 3 (LOWEST): Applied as baseGain * duckVolume
   */
  duckVolume: z.number().min(0).max(1).optional(),
  
  /** Attack time in seconds (how fast to duck, default 0.10) */
  attackSec: z.number().nonnegative().default(0.10),
  
  /** Release time in seconds (how fast to restore, default 0.25) */
  releaseSec: z.number().nonnegative().default(0.25),
  
  // --- Anti-wobble stabilization ---
  
  /** 
   * Merge gap threshold in seconds (default 0.35)
   * Adjacent talk intervals closer than this are merged to prevent wobbling
   */
  mergeGapSec: z.number().nonnegative().default(0.35),
  
  /** 
   * Minimum hold duration in seconds (default 0.60)
   * Short talk intervals are extended to at least this duration
   */
  minHoldSec: z.number().nonnegative().default(0.60),
});

/**
 * BGM configuration (full)
 * Priority order for base volume: volumeDb > volume > DEFAULT_BASE_DB (-12)
 */
export const bgmConfigSchema = z.object({
  /** Path to BGM file (relative to public/, e.g. "bgm/main.mp3") */
  src: z.string(),
  
  /** Preset name for quick configuration */
  preset: bgmPresetSchema,
  
  // --- Base volume (backward compatible) ---
  
  /**
   * Base volume in dB (e.g. -12)
   * Priority 1 (HIGHEST): Converted to gain = 10^(volumeDb/20)
   */
  volumeDb: z.number().min(-60).max(6).optional(),
  
  /** 
   * Base volume (0.0-1.0)
   * Priority 2 (LOWEST): Used directly as gain
   */
  volume: z.number().min(0).max(1).optional(),
  
  /**
   * Maximum gain in dB (clip prevention, e.g. -3)
   * Final gain is clamped to this value
   */
  maxGainDb: z.number().min(-60).max(6).default(-3),
  
  // --- Fade ---
  
  /** Fade in duration in seconds (default 1.0) */
  fadeInSec: z.number().nonnegative().default(1.0),
  
  /** Fade out duration in seconds (default 1.0) */
  fadeOutSec: z.number().nonnegative().default(1.0),
  
  // --- Loop configuration ---
  
  /** Whether to loop the BGM (default true) */
  loop: z.boolean().default(true),
  
  /** Loop start point in seconds (for seamless looping) */
  loopStartSec: z.number().nonnegative().optional(),
  
  /** Loop end point in seconds (for seamless looping) */
  loopEndSec: z.number().nonnegative().optional(),
  
  /** Loop crossfade duration in seconds (default 0.25) */
  loopCrossfadeSec: z.number().nonnegative().default(0.25),
  
  // --- Idle boost (non-talk volume boost) ---
  
  /**
   * Volume boost in dB when no one is talking (e.g. +3)
   * Applied on top of base volume, clamped by maxGainDb
   */
  idleBoostDb: z.number().min(-60).max(12).optional(),
  
  // --- Ducking ---
  
  /** Ducking configuration */
  ducking: bgmDuckingConfigSchema.optional(),
});

/**
 * Scene-level BGM override (optional src, can override settings only)
 */
export const sceneBgmOverrideSchema = bgmConfigSchema.partial().extend({
  /** Transition duration from previous scene's BGM in seconds */
  transitionSec: z.number().nonnegative().optional(),
});

// Video configuration
export const videoConfigSchema = z.object({
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  defaultPauseSec: z.number().nonnegative().default(0.5),
  /** Background music configuration */
  bgm: bgmConfigSchema.optional(),
});

// Block types - dialogue with audioKey support for stable audio binding
export const dialogueBlockSchema = z.object({
  type: z.literal("dialogue"),
  speaker: z.string(),
  text: z.string().min(1),
  pauseSec: z.number().nonnegative().optional(),
  // New fields for stable audio binding (重複テキスト耐性)
  id: z.string().optional(),
  audioKey: z.string().optional(),
  fileName: z.string().optional(),
});

// Union of all block types (currently only dialogue)
export const blockSchema = z.discriminatedUnion("type", [
  dialogueBlockSchema,
]);

// Scene style configuration (with BGM override support)
export const sceneStyleSchema = z.object({
  bg: z.string().optional(),
  subtitleStyle: z.string().optional(),
  /** Scene-level BGM override (can change src or just override settings) */
  bgm: sceneBgmOverrideSchema.optional(),
});

// Scene definition
export const sceneSchema = z.object({
  id: z.string(),
  style: sceneStyleSchema.optional(),
  blocks: z.array(blockSchema),
});

// Root Script schema
export const scriptSchema = z.object({
  version: z.literal("0.1"),
  video: videoConfigSchema,
  cast: z.record(z.string(), castMemberSchema),
  scenes: z.array(sceneSchema).min(1),
});

// TypeScript types derived from schemas
export type VoiceConfig = z.infer<typeof voiceConfigSchema>;
export type CastMember = z.infer<typeof castMemberSchema>;
export type BgmPreset = z.infer<typeof bgmPresetSchema>;
export type BgmDuckingConfig = z.infer<typeof bgmDuckingConfigSchema>;
export type BgmConfig = z.infer<typeof bgmConfigSchema>;
export type SceneBgmOverride = z.infer<typeof sceneBgmOverrideSchema>;
export type VideoConfig = z.infer<typeof videoConfigSchema>;
export type DialogueBlock = z.infer<typeof dialogueBlockSchema>;
export type Block = z.infer<typeof blockSchema>;
export type SceneStyle = z.infer<typeof sceneStyleSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Script = z.infer<typeof scriptSchema>;

/**
 * Parse and validate a Script from unknown input
 */
export function parseScript(input: unknown): Script {
  return scriptSchema.parse(input);
}
