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
  TimelineAssets 
} from "../../spec/timeline.schema";
import { processDialogueBlock, type AudioManifestItem } from "./rules/dialogue";

/**
 * Compile options
 */
export interface CompileOptions {
  /** Audio manifest from VOICEVOX generation */
  audioManifest: AudioManifestItem[];
}

/**
 * Compile a Script into a Timeline
 */
export function compile(script: Script, options: CompileOptions): Timeline {
  const { audioManifest } = options;
  const { fps, width, height } = script.video;
  
  // Initialize tracks
  const audioTrack: AudioTrack = { type: "audio", clips: [] };
  const subtitleTrack: SubtitleTrack = { type: "subtitle", clips: [] };
  const characterTrack: CharacterTrack = { type: "character", clips: [] };
  
  // Initialize assets
  const assets: TimelineAssets = { audio: {} };
  
  // Track current frame position
  let currentFrame = 0;
  let blockIndex = 0;
  
  // Process all scenes
  for (const scene of script.scenes) {
    // Process all blocks in the scene
    for (const block of scene.blocks) {
      const result = processBlock(block, {
        script,
        audioManifest,
        currentFrame,
        blockIndex,
      });
      
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
    }
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
    tracks: [audioTrack, subtitleTrack, characterTrack],
  };
  
  return timeline;
}

/**
 * Process a single block based on its type
 */
function processBlock(
  block: Block,
  ctx: {
    script: Script;
    audioManifest: AudioManifestItem[];
    currentFrame: number;
    blockIndex: number;
  }
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
