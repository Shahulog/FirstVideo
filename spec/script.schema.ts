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

// BGM ducking configuration (auto volume reduction during dialogue)
export const bgmDuckingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** Volume multiplier during dialogue (0.0-1.0, default 0.35) */
  duckVolume: z.number().min(0).max(1).default(0.35),
  /** Attack time in seconds (how fast to duck, default 0.1) */
  attackSec: z.number().nonnegative().default(0.1),
  /** Release time in seconds (how fast to restore, default 0.2) */
  releaseSec: z.number().nonnegative().default(0.2),
});

// BGM configuration
export const bgmConfigSchema = z.object({
  /** Path to BGM file (relative to public/, e.g. "bgm/main.mp3") */
  src: z.string(),
  /** Base volume (0.0-1.0, default 0.25) */
  volume: z.number().min(0).max(1).default(0.25),
  /** Fade in duration in seconds (default 1.0) */
  fadeInSec: z.number().nonnegative().default(1.0),
  /** Fade out duration in seconds (default 1.0) */
  fadeOutSec: z.number().nonnegative().default(1.0),
  /** Whether to loop the BGM (default true) */
  loop: z.boolean().default(true),
  /** Ducking configuration */
  ducking: bgmDuckingConfigSchema.optional(),
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

// Scene style configuration
export const sceneStyleSchema = z.object({
  bg: z.string().optional(),
  subtitleStyle: z.string().optional(),
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
export type BgmDuckingConfig = z.infer<typeof bgmDuckingConfigSchema>;
export type BgmConfig = z.infer<typeof bgmConfigSchema>;
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
