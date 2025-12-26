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

// Video configuration
export const videoConfigSchema = z.object({
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  defaultPauseSec: z.number().nonnegative().default(0.5),
});

// Block types
export const dialogueBlockSchema = z.object({
  type: z.literal("dialogue"),
  speaker: z.string(),
  text: z.string().min(1),
  pauseSec: z.number().nonnegative().optional(),
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

