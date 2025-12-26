/**
 * Dialogue Block Rule
 * 
 * Processes dialogue blocks and generates timeline clips.
 * Supports talk/idle split for natural character animation.
 */
import type { DialogueBlock, Script } from "../../../spec/script.schema";
import type { AudioClip, SubtitleClip, CharacterClip, AudioAsset } from "../../../spec/timeline.schema";
import { secToFrames } from "../../domain/time";

/**
 * Audio manifest item structure (from generate_audio.mjs output)
 */
export interface AudioManifestItem {
  fileName: string;
  text: string;
  speakerId: number;
  audioSrc: string;
  durationInSeconds: number;
}

/**
 * Result of processing a dialogue block
 * Now returns multiple character clips for talk/idle split
 */
export interface DialogueRuleResult {
  audioAssetId: string;
  audioAsset: AudioAsset;
  audioClip: AudioClip;
  subtitleClip: SubtitleClip;
  /** Character clips: [talkClip] or [talkClip, idleClip] */
  characterClips: CharacterClip[];
  totalDurationFrames: number;
}

/**
 * Context for processing dialogue blocks
 */
export interface DialogueContext {
  script: Script;
  audioManifest: AudioManifestItem[];
  currentFrame: number;
  blockIndex: number;
}

/**
 * Process a dialogue block and generate timeline clips
 * 
 * Character animation is split into:
 * - Talk clip: isTalking=true during audio playback
 * - Idle clip: isTalking=false during pause (if pauseFrames > 0)
 */
export function processDialogueBlock(
  block: DialogueBlock,
  ctx: DialogueContext
): DialogueRuleResult {
  const { script, audioManifest, currentFrame, blockIndex } = ctx;
  const { fps, defaultPauseSec } = script.video;
  
  // Find audio in manifest by matching text and speaker
  const speaker = block.speaker;
  const castMember = script.cast[speaker];
  
  if (!castMember) {
    console.warn(`[dialogue] Speaker "${speaker}" not found in cast. Using fallback duration.`);
  }
  
  // Try to find matching audio in manifest
  // Match by text content (primary) or by index as fallback
  const manifestItem = audioManifest.find(
    (item) => item.text === block.text
  ) ?? audioManifest[blockIndex];
  
  let durationFrames: number;
  let audioSrc: string;
  
  if (manifestItem && manifestItem.durationInSeconds > 0) {
    durationFrames = secToFrames(manifestItem.durationInSeconds, fps);
    audioSrc = manifestItem.audioSrc;
  } else {
    // Fallback: use 2 seconds if no audio found
    console.warn(
      `[dialogue] Audio not found for block ${blockIndex}: "${block.text.slice(0, 30)}...". Using fallback duration.`
    );
    durationFrames = fps * 2;
    audioSrc = `audio/${String(blockIndex + 1).padStart(3, "0")}.wav`;
  }
  
  // Calculate pause duration
  const pauseSec = block.pauseSec ?? defaultPauseSec;
  const pauseFrames = secToFrames(pauseSec, fps);
  
  // Total duration for this block
  const totalDurationFrames = durationFrames + pauseFrames;
  
  // Generate asset ID
  const audioAssetId = `audio_${String(blockIndex + 1).padStart(3, "0")}`;
  
  // Create audio asset
  const audioAsset: AudioAsset = {
    src: audioSrc,
    durationFrames,
  };
  
  // Create audio clip (only for the actual audio duration, not pause)
  const audioClip: AudioClip = {
    assetId: audioAssetId,
    start: currentFrame,
    duration: durationFrames,
  };
  
  // Create subtitle clip (for entire duration including pause)
  const subtitleClip: SubtitleClip = {
    start: currentFrame,
    duration: totalDurationFrames,
    text: block.text,
  };
  
  // Create character clips with talk/idle split
  const characterClips: CharacterClip[] = [];
  
  // Talk clip: during audio playback
  characterClips.push({
    start: currentFrame,
    duration: durationFrames,
    characterId: speaker,
    state: {
      isTalking: true,
    },
  });
  
  // Idle clip: during pause (only if there's a pause)
  if (pauseFrames > 0) {
    characterClips.push({
      start: currentFrame + durationFrames,
      duration: pauseFrames,
      characterId: speaker,
      state: {
        isTalking: false,
      },
    });
  }
  
  return {
    audioAssetId,
    audioAsset,
    audioClip,
    subtitleClip,
    characterClips,
    totalDurationFrames,
  };
}
