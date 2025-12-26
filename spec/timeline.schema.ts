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

// Timeline assets
export const timelineAssetsSchema = z.object({
  audio: z.record(z.string(), audioAssetSchema),
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

// Union of all track types
export const trackSchema = z.discriminatedUnion("type", [
  audioTrackSchema,
  subtitleTrackSchema,
  characterTrackSchema,
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
export type TimelineAssets = z.infer<typeof timelineAssetsSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type SubtitleClip = z.infer<typeof subtitleClipSchema>;
export type SubtitleTrack = z.infer<typeof subtitleTrackSchema>;
export type CharacterState = z.infer<typeof characterStateSchema>;
export type CharacterClip = z.infer<typeof characterClipSchema>;
export type CharacterTrack = z.infer<typeof characterTrackSchema>;
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

