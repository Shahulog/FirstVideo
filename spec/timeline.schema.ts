/**
 * Timeline Schema v0.1
 * 
 * Timeline represents the machine-generated editing result.
 * It describes frame-precise positioning of all assets and effects.
 */
import { z } from "zod";

// Meta information about the timeline
export const timelineMetaSchema = z.object({
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  totalFrames: z.number().int().nonnegative(),
});

// Audio asset reference
export const audioAssetSchema = z.object({
  src: z.string(),
  durationFrames: z.number().int().nonnegative(),
});

// BGM asset reference
export const bgmAssetSchema = z.object({
  src: z.string(),
  /** Duration in frames (from ffprobe). Optional - if missing, loop is disabled. */
  durationFrames: z.number().int().positive().optional(),
  /**
   * Loudness normalization gain in dB (from ffmpeg loudnorm analysis).
   * Applied as baseGain multiplier: baseGain * 10^(loudnessGainDb/20)
   * Clamped to [-12, +12] for safety.
   */
  loudnessGainDb: z.number().min(-12).max(12).optional(),
});

// Timeline assets
export const timelineAssetsSchema = z.object({
  audio: z.record(z.string(), audioAssetSchema),
  bgm: z.record(z.string(), bgmAssetSchema).optional(),
});

// Audio clip on the audio track
export const audioClipSchema = z.object({
  assetId: z.string(),
  start: z.number().int().nonnegative(),
  duration: z.number().int().positive(),
});

// Audio track
export const audioTrackSchema = z.object({
  type: z.literal("audio"),
  clips: z.array(audioClipSchema),
});

// Subtitle clip on the subtitle track
export const subtitleClipSchema = z.object({
  start: z.number().int().nonnegative(),
  duration: z.number().int().positive(),
  text: z.string(),
});

// Subtitle track
export const subtitleTrackSchema = z.object({
  type: z.literal("subtitle"),
  clips: z.array(subtitleClipSchema),
});

// Character state
export const characterStateSchema = z.object({
  isTalking: z.boolean(),
});

// Character clip on the character track
export const characterClipSchema = z.object({
  start: z.number().int().nonnegative(),
  duration: z.number().int().positive(),
  characterId: z.string(),
  state: characterStateSchema,
});

// Character track
export const characterTrackSchema = z.object({
  type: z.literal("character"),
  clips: z.array(characterClipSchema),
});

// ============================================================
// BGM Configuration (Pro Quality - Frame-based)
// ============================================================

/**
 * BGM ducking configuration (frame-based) with stabilization
 * Priority order for ducking: duckDeltaDb > duckVolumeDb > duckVolume
 */
export const bgmDuckingSchema = z.object({
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
  
  /** Attack time in frames */
  attackFrames: z.number().int().nonnegative().default(3),
  
  /** Release time in frames */
  releaseFrames: z.number().int().nonnegative().default(8),
  
  // --- Anti-wobble stabilization ---
  
  /** 
   * Merge gap threshold in frames
   * Adjacent talk intervals closer than this are merged
   */
  mergeGapFrames: z.number().int().nonnegative().optional(),
  
  /** 
   * Minimum hold duration in frames
   * Short talk intervals are extended to at least this duration
   */
  minHoldFrames: z.number().int().nonnegative().optional(),
});

/**
 * BGM clip on the bgm track (Pro Quality)
 * Priority order for base volume: volumeDb > volume > DEFAULT_BASE_DB (-12)
 */
export const bgmClipSchema = z.object({
  assetId: z.string(),
  start: z.number().int().nonnegative(),
  duration: z.number().int().positive(),
  
  /**
   * Audio playback offset in frames.
   * When a clip is split (e.g., for setting changes) but uses the same src,
   * this offset ensures continuous playback instead of restarting from 0.
   */
  audioOffsetFrames: z.number().int().nonnegative().optional(),
  
  // --- Base volume ---
  
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
   * Maximum gain in dB (clip prevention)
   * Final gain is clamped to this value
   */
  maxGainDb: z.number().min(-60).max(6).optional(),
  
  // --- Fade ---
  
  /** Fade in duration in frames */
  fadeInFrames: z.number().int().nonnegative().default(30),
  
  /** Fade out duration in frames */
  fadeOutFrames: z.number().int().nonnegative().default(30),
  
  // --- Loop configuration ---
  
  /** Whether to loop the BGM */
  loop: z.boolean().default(true),
  
  /** Loop start point in frames */
  loopStartFrames: z.number().int().nonnegative().optional(),
  
  /** Loop end point in frames */
  loopEndFrames: z.number().int().nonnegative().optional(),
  
  /** Loop crossfade duration in frames */
  loopCrossfadeFrames: z.number().int().nonnegative().optional(),
  
  // --- Idle boost ---
  
  /**
   * Volume boost in dB when no one is talking
   * Applied on top of base volume, clamped by maxGainDb
   */
  idleBoostDb: z.number().min(-60).max(12).optional(),
  
  // --- Ducking ---
  
  /** Ducking configuration */
  ducking: bgmDuckingSchema.optional(),
  
  // --- Scene transition (clip-to-clip crossfade) ---
  
  /** Transition in duration in frames (crossfade from previous clip) */
  transitionInFrames: z.number().int().nonnegative().optional(),
  
  /** Transition out duration in frames (crossfade to next clip) */
  transitionOutFrames: z.number().int().nonnegative().optional(),
});

// BGM track (supports multiple clips for scene transitions)
export const bgmTrackSchema = z.object({
  type: z.literal("bgm"),
  clips: z.array(bgmClipSchema),
});

// Union of all track types
export const trackSchema = z.discriminatedUnion("type", [
  audioTrackSchema,
  subtitleTrackSchema,
  characterTrackSchema,
  bgmTrackSchema,
]);

// Root Timeline schema
export const timelineSchema = z.object({
  version: z.literal("0.1"),
  meta: timelineMetaSchema,
  assets: timelineAssetsSchema,
  tracks: z.array(trackSchema),
});

// TypeScript types derived from schemas
export type TimelineMeta = z.infer<typeof timelineMetaSchema>;
export type AudioAsset = z.infer<typeof audioAssetSchema>;
export type BgmAsset = z.infer<typeof bgmAssetSchema>;
export type TimelineAssets = z.infer<typeof timelineAssetsSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type SubtitleClip = z.infer<typeof subtitleClipSchema>;
export type SubtitleTrack = z.infer<typeof subtitleTrackSchema>;
export type CharacterState = z.infer<typeof characterStateSchema>;
export type CharacterClip = z.infer<typeof characterClipSchema>;
export type CharacterTrack = z.infer<typeof characterTrackSchema>;
export type BgmDucking = z.infer<typeof bgmDuckingSchema>;
export type BgmClip = z.infer<typeof bgmClipSchema>;
export type BgmTrack = z.infer<typeof bgmTrackSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Timeline = z.infer<typeof timelineSchema>;

/**
 * Parse and validate a Timeline from unknown input
 */
export function parseTimeline(input: unknown): Timeline {
  return timelineSchema.parse(input);
}

/**
 * Helper to get typed track from timeline
 */
export function getAudioTrack(timeline: Timeline): AudioTrack | undefined {
  return timeline.tracks.find((t): t is AudioTrack => t.type === "audio");
}

export function getSubtitleTrack(timeline: Timeline): SubtitleTrack | undefined {
  return timeline.tracks.find((t): t is SubtitleTrack => t.type === "subtitle");
}

export function getCharacterTrack(timeline: Timeline): CharacterTrack | undefined {
  return timeline.tracks.find((t): t is CharacterTrack => t.type === "character");
}

export function getBgmTrack(timeline: Timeline): BgmTrack | undefined {
  return timeline.tracks.find((t): t is BgmTrack => t.type === "bgm");
}
