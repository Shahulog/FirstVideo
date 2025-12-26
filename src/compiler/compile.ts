/**
 * Compiler: Script -> Timeline
 * 
 * Transforms a Script (intent) into a Timeline (frame-precise edit result).
 * This is the SINGLE SOURCE OF TRUTH for timeline compilation.
 */
import type { Script, Block } from "../../spec/script.schema";
import type { 
  Timeline, 
  AudioTrack, 
  SubtitleTrack, 
  CharacterTrack,
  BgmTrack,
  BgmClip,
  TimelineAssets,
  Track,
} from "../../spec/timeline.schema";
import { processDialogueBlock, type AudioManifestItem, type DialogueContext } from "./rules/dialogue";
import { secToFrames } from "../domain/time";

/**
 * Compile options
 */
export interface CompileOptions {
  /** Audio manifest from VOICEVOX generation (SSOT: src/generated/audio-manifest.json) */
  audioManifest: AudioManifestItem[];
  /** BGM duration in frames by asset ID (from ffprobe). If missing, loop is disabled. */
  bgmDurationFrames?: Record<string, number>;
}

/**
 * Compile a Script into a Timeline
 */
export function compile(script: Script, options: CompileOptions): Timeline {
  const { audioManifest, bgmDurationFrames } = options;
  const { fps, width, height, bgm } = script.video;
  
  // Initialize tracks
  const audioTrack: AudioTrack = { type: "audio", clips: [] };
  const subtitleTrack: SubtitleTrack = { type: "subtitle", clips: [] };
  const characterTrack: CharacterTrack = { type: "character", clips: [] };
  
  // Initialize assets
  const assets: TimelineAssets = { audio: {} };
  
  // Track current frame position
  let currentFrame = 0;
  let globalBlockIndex = 0;
  
  // Process all scenes
  for (const scene of script.scenes) {
    let blockIndex = 0;
    
    // Process all blocks in the scene
    for (const block of scene.blocks) {
      const ctx: DialogueContext = {
        script,
        scene,
        audioManifest,
        currentFrame,
        blockIndex,
        globalBlockIndex,
      };
      
      const result = processBlock(block, ctx);
      
      if (result) {
        // Add assets
        assets.audio[result.audioAssetId] = result.audioAsset;
        
        // Add clips to tracks
        audioTrack.clips.push(result.audioClip);
        subtitleTrack.clips.push(result.subtitleClip);
        
        // Add all character clips (talk + idle)
        for (const clip of result.characterClips) {
          characterTrack.clips.push(clip);
        }
        
        // Advance frame position
        currentFrame += result.totalDurationFrames;
      }
      
      blockIndex++;
      globalBlockIndex++;
    }
  }
  
  // Build tracks array
  const tracks: Track[] = [audioTrack, subtitleTrack, characterTrack];
  
  // Add BGM track if configured
  if (bgm) {
    const bgmAssetId = "bgm1";
    
    // Add BGM asset (with durationFrames if available from ffprobe)
    const bgmDuration = bgmDurationFrames?.[bgmAssetId];
    assets.bgm = {
      [bgmAssetId]: { 
        src: bgm.src,
        ...(bgmDuration !== undefined && { durationFrames: bgmDuration }),
      },
    };
    
    // Create BGM clip with frame-based values
    // Priority order for base volume: volumeDb > volume > DEFAULT_BASE_DB (-12)
    const bgmClip: BgmClip = {
      assetId: bgmAssetId,
      start: 0,
      duration: currentFrame,
      fadeInFrames: Math.max(1, secToFrames(bgm.fadeInSec ?? 1.0, fps)),
      fadeOutFrames: Math.max(1, secToFrames(bgm.fadeOutSec ?? 1.0, fps)),
      loop: bgm.loop ?? true,
    };
    
    // Set volume - prioritize volumeDb over volume
    if (bgm.volumeDb !== undefined) {
      bgmClip.volumeDb = bgm.volumeDb;
    } else if (bgm.volume !== undefined) {
      bgmClip.volume = bgm.volume;
    } else {
      // Default: -12 dB
      bgmClip.volumeDb = -12;
    }
    
    // Add ducking configuration if present
    if (bgm.ducking) {
      // Priority order: duckDeltaDb > duckVolumeDb > duckVolume
      bgmClip.ducking = {
        enabled: bgm.ducking.enabled ?? true,
        attackFrames: Math.max(1, secToFrames(bgm.ducking.attackSec ?? 0.1, fps)),
        releaseFrames: Math.max(1, secToFrames(bgm.ducking.releaseSec ?? 0.2, fps)),
      };
      
      // Set ducking volume - preserve priority order
      if (bgm.ducking.duckDeltaDb !== undefined) {
        bgmClip.ducking.duckDeltaDb = bgm.ducking.duckDeltaDb;
      } else if (bgm.ducking.duckVolumeDb !== undefined) {
        bgmClip.ducking.duckVolumeDb = bgm.ducking.duckVolumeDb;
      } else if (bgm.ducking.duckVolume !== undefined) {
        bgmClip.ducking.duckVolume = bgm.ducking.duckVolume;
      } else {
        // Default: -8 dB delta
        bgmClip.ducking.duckDeltaDb = -8;
      }
    }
    
    // Create BGM track
    const bgmTrack: BgmTrack = {
      type: "bgm",
      clips: [bgmClip],
    };
    
    tracks.push(bgmTrack);
  }
  
  // Build final timeline
  const timeline: Timeline = {
    version: "0.1",
    meta: {
      fps,
      width,
      height,
      totalFrames: currentFrame,
    },
    assets,
    tracks,
  };
  
  return timeline;
}

/**
 * Process a single block based on its type
 */
function processBlock(
  block: Block,
  ctx: DialogueContext
) {
  switch (block.type) {
    case "dialogue":
      return processDialogueBlock(block, ctx);
    
    default:
      // TypeScript exhaustive check
      const _exhaustive: never = block;
      throw new Error(`Unknown block type: ${(_exhaustive as Block).type}`);
  }
}
