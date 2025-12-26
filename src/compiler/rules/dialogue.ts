/**
 * Dialogue Block Rule
 * 
 * Processes dialogue blocks and generates timeline clips.
 * Supports talk/idle split for natural character animation.
 * Uses audioKey for stable audio binding (重複テキスト耐性).
 */
import type { DialogueBlock, Script, Scene } from "../../../spec/script.schema";
import type { AudioClip, SubtitleClip, CharacterClip, AudioAsset } from "../../../spec/timeline.schema";
import { secToFrames } from "../../domain/time";

/**
 * Audio manifest item structure (with audioKey support)
 * SSOT: src/generated/audio-manifest.json
 */
export interface AudioManifestItem {
  audioKey: string;
  speakerId: number;
  text: string;
  audioSrc: string;
  durationInSeconds: number;
  // Legacy fields (optional)
  fileName?: string;
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
  scene: Scene;
  audioManifest: AudioManifestItem[];
  currentFrame: number;
  blockIndex: number;
  globalBlockIndex: number;
}

/**
 * Generate audioKey for a dialogue block
 * Rule: sceneId:blockIndex (deterministic, does not include text)
 */
export function generateAudioKey(sceneId: string, blockIndex: number): string {
  return `${sceneId}:${blockIndex}`;
}

/**
 * Find audio in manifest by audioKey
 * Priority: 1) fileName 2) audioKey 3) fallback
 */
function findAudioInManifest(
  block: DialogueBlock,
  audioManifest: AudioManifestItem[],
  expectedAudioKey: string
): AudioManifestItem | undefined {
  // 1) fileName が指定されていれば最優先
  if (block.fileName) {
    const byFileName = audioManifest.find(
      (item) => item.audioSrc?.includes(block.fileName!) || item.fileName === block.fileName
    );
    if (byFileName) return byFileName;
  }
  
  // 2) audioKey で検索（最重要）
  const audioKey = block.audioKey ?? expectedAudioKey;
  const byAudioKey = audioManifest.find((item) => item.audioKey === audioKey);
  if (byAudioKey) return byAudioKey;
  
  // 3) Fallback: undefined (caller will handle)
  return undefined;
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
  const { script, scene, audioManifest, currentFrame, blockIndex, globalBlockIndex } = ctx;
  const { fps, defaultPauseSec } = script.video;
  
  const speaker = block.speaker;
  const castMember = script.cast[speaker];
  
  if (!castMember) {
    console.warn(`[dialogue] Speaker "${speaker}" not found in cast.`);
  }
  
  // Generate expected audioKey for this block
  const expectedAudioKey = generateAudioKey(scene.id, blockIndex);
  
  // Find audio in manifest using audioKey
  const manifestItem = findAudioInManifest(block, audioManifest, expectedAudioKey);
  
  let durationFrames: number;
  let audioSrc: string;
  
  if (manifestItem && manifestItem.durationInSeconds > 0) {
    durationFrames = secToFrames(manifestItem.durationInSeconds, fps);
    audioSrc = manifestItem.audioSrc;
  } else {
    // Fallback: use 2 seconds if no audio found
    const actualAudioKey = block.audioKey ?? expectedAudioKey;
    console.warn(
      `[dialogue] Audio not found: audioKey="${actualAudioKey}", speaker="${speaker}", text="${block.text.slice(0, 30)}...". Using fallback duration.`
    );
    durationFrames = fps * 2;
    audioSrc = `audio/${String(globalBlockIndex + 1).padStart(3, "0")}.wav`;
  }
  
  // Calculate pause duration
  const pauseSec = block.pauseSec ?? defaultPauseSec;
  const pauseFrames = secToFrames(pauseSec, fps);
  
  // Total duration for this block
  const totalDurationFrames = durationFrames + pauseFrames;
  
  // Generate asset ID
  const audioAssetId = `audio_${String(globalBlockIndex + 1).padStart(3, "0")}`;
  
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
