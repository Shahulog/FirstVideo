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

// BGM ducking configuration (frame-based)
export const bgmDuckingSchema = z.object({
  enabled: z.boolean().default(true),
  /** Volume multiplier during dialogue (0.0-1.0) */
  duckVolume: z.number().min(0).max(1).default(0.35),
  /** Attack time in frames */
  attackFrames: z.number().int().nonnegative().default(3),
  /** Release time in frames */
  releaseFrames: z.number().int().nonnegative().default(6),
});

// BGM clip on the bgm track
export const bgmClipSchema = z.object({
  assetId: z.string(),
  start: z.number().int().nonnegative(),
  duration: z.number().int().positive(),
  /** Base volume (0.0-1.0) */
  volume: z.number().min(0).max(1).default(0.25),
  /** Fade in duration in frames */
  fadeInFrames: z.number().int().nonnegative().default(30),
  /** Fade out duration in frames */
  fadeOutFrames: z.number().int().nonnegative().default(30),
  /** Whether to loop the BGM */
  loop: z.boolean().default(true),
  /** Ducking configuration */
  ducking: bgmDuckingSchema.optional(),
});

// BGM track
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
