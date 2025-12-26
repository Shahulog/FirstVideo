/**
 * Compiler: Script -> Timeline
 * 
 * Transforms a Script (intent) into a Timeline (frame-precise edit result).
 * This is the SINGLE SOURCE OF TRUTH for timeline compilation.
 */
import type { Script, Block, Scene, BgmConfig } from "../../spec/script.schema";
import type { 
  Timeline, 
  AudioTrack, 
  SubtitleTrack, 
  CharacterTrack,
  BgmTrack,
  BgmClip,
  TimelineAssets,
  Track,
  BgmAsset,
} from "../../spec/timeline.schema";
import { processDialogueBlock, type AudioManifestItem, type DialogueContext } from "./rules/dialogue";
import { secToFrames } from "../domain/time";
import { 
  resolveBgmConfig, 
  generateBgmAssetId,
  DEFAULT_TRANSITION_SEC,
  type ResolvedBgmConfig,
} from "./presets/bgm";

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
 * Scene timing information
 */
interface SceneTiming {
  sceneId: string;
  startFrame: number;
  endFrame: number;
  scene: Scene;
}

/**
 * Compile a Script into a Timeline
 */
export function compile(script: Script, options: CompileOptions): Timeline {
  const { audioManifest, bgmDurationFrames } = options;
  const { fps, width, height, bgm: videoBgm } = script.video;
  
  // Initialize tracks
  const audioTrack: AudioTrack = { type: "audio", clips: [] };
  const subtitleTrack: SubtitleTrack = { type: "subtitle", clips: [] };
  const characterTrack: CharacterTrack = { type: "character", clips: [] };
  
  // Initialize assets
  const assets: TimelineAssets = { audio: {} };
  
  // Track current frame position and scene timings
  let currentFrame = 0;
  let globalBlockIndex = 0;
  const sceneTimings: SceneTiming[] = [];
  
  // Process all scenes
  for (const scene of script.scenes) {
    const sceneStartFrame = currentFrame;
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
    
    // Record scene timing
    sceneTimings.push({
      sceneId: scene.id,
      startFrame: sceneStartFrame,
      endFrame: currentFrame,
      scene,
    });
  }
  
  const totalFrames = currentFrame;
  
  // Build tracks array
  const tracks: Track[] = [audioTrack, subtitleTrack, characterTrack];
  
  // Generate BGM track if configured
  if (videoBgm) {
    const { bgmAssets, bgmTrack } = generateBgmTrack(
      videoBgm,
      sceneTimings,
      totalFrames,
      fps,
      bgmDurationFrames
    );
    
    // Add BGM assets
    assets.bgm = bgmAssets;
    
    // Add BGM track if there are clips
    if (bgmTrack.clips.length > 0) {
      tracks.push(bgmTrack);
    }
  }
  
  // Build final timeline
  const timeline: Timeline = {
    version: "0.1",
    meta: {
      fps,
      width,
      height,
      totalFrames,
    },
    assets,
    tracks,
  };
  
  return timeline;
}

/**
 * Generate BGM track with scene-based clips and transitions
 */
function generateBgmTrack(
  videoBgm: BgmConfig,
  sceneTimings: SceneTiming[],
  totalFrames: number,
  fps: number,
  bgmDurationFrames?: Record<string, number>
): { bgmAssets: Record<string, BgmAsset>; bgmTrack: BgmTrack } {
  const bgmAssets: Record<string, BgmAsset> = {};
  const bgmClips: BgmClip[] = [];
  
  // Track previous clip for transition handling
  let prevClipEnd = 0;
  let prevAssetId: string | undefined;
  let prevConfig: ResolvedBgmConfig | undefined;
  
  for (let i = 0; i < sceneTimings.length; i++) {
    const { startFrame, endFrame, scene } = sceneTimings[i];
    const sceneOverride = scene.style?.bgm;
    
    // Resolve BGM config for this scene
    const config = resolveBgmConfig(videoBgm, sceneOverride);
    const assetId = generateBgmAssetId(config.src);
    
    // Add asset if not already present
    if (!bgmAssets[assetId]) {
      const durationFrames = bgmDurationFrames?.[assetId];
      bgmAssets[assetId] = {
        src: config.src,
        ...(durationFrames !== undefined && { durationFrames }),
      };
    }
    
    // Determine transition
    const transitionSec = sceneOverride?.transitionSec ?? DEFAULT_TRANSITION_SEC;
    const transitionFrames = Math.max(1, secToFrames(transitionSec, fps));
    
    // Check if src changed (requires clip split with transition)
    const srcChanged = prevAssetId !== undefined && prevAssetId !== assetId;
    const isFirstScene = i === 0;
    const isLastScene = i === sceneTimings.length - 1;
    
    // Calculate clip boundaries with overlap for transitions
    let clipStart = startFrame;
    let clipEnd = endFrame;
    
    // Handle transition from previous clip
    if (!isFirstScene && srcChanged) {
      // Overlap with previous clip for crossfade
      clipStart = Math.max(0, startFrame - transitionFrames);
    }
    
    // Create BGM clip
    const bgmClip = createBgmClip(
      assetId,
      clipStart,
      clipEnd - clipStart,
      config,
      fps,
      {
        isFirstClip: isFirstScene,
        isLastClip: isLastScene,
        transitionInFrames: srcChanged ? transitionFrames : undefined,
        transitionOutFrames: undefined, // Will be set when next clip is processed
      }
    );
    
    // Update previous clip's transitionOutFrames if src changed
    if (srcChanged && bgmClips.length > 0) {
      const prevClip = bgmClips[bgmClips.length - 1];
      prevClip.transitionOutFrames = transitionFrames;
      // Extend previous clip to overlap
      prevClip.duration = startFrame + transitionFrames - prevClip.start;
    }
    
    bgmClips.push(bgmClip);
    
    prevClipEnd = clipEnd;
    prevAssetId = assetId;
    prevConfig = config;
  }
  
  // If no scene-based clips were created but we have video-level BGM,
  // create a single clip spanning the entire timeline
  if (bgmClips.length === 0 && sceneTimings.length === 0) {
    const config = resolveBgmConfig(videoBgm);
    const assetId = generateBgmAssetId(config.src);
    const durationFrames = bgmDurationFrames?.[assetId];
    
    bgmAssets[assetId] = {
      src: config.src,
      ...(durationFrames !== undefined && { durationFrames }),
    };
    
    bgmClips.push(createBgmClip(
      assetId,
      0,
      totalFrames,
      config,
      fps,
      { isFirstClip: true, isLastClip: true }
    ));
  }
  
  return {
    bgmAssets,
    bgmTrack: {
      type: "bgm",
      clips: bgmClips,
    },
  };
}

/**
 * Create a single BGM clip with all parameters
 */
function createBgmClip(
  assetId: string,
  start: number,
  duration: number,
  config: ResolvedBgmConfig,
  fps: number,
  options: {
    isFirstClip: boolean;
    isLastClip: boolean;
    transitionInFrames?: number;
    transitionOutFrames?: number;
  }
): BgmClip {
  const { isFirstClip, isLastClip, transitionInFrames, transitionOutFrames } = options;
  
  const bgmClip: BgmClip = {
    assetId,
    start,
    duration,
    volumeDb: config.volumeDb,
    maxGainDb: config.maxGainDb,
    fadeInFrames: isFirstClip ? Math.max(1, secToFrames(config.fadeInSec, fps)) : 1,
    fadeOutFrames: isLastClip ? Math.max(1, secToFrames(config.fadeOutSec, fps)) : 1,
    loop: config.loop,
    idleBoostDb: config.idleBoostDb,
  };
  
  // Loop configuration
  if (config.loopStartSec !== undefined) {
    bgmClip.loopStartFrames = secToFrames(config.loopStartSec, fps);
  }
  if (config.loopEndSec !== undefined) {
    bgmClip.loopEndFrames = secToFrames(config.loopEndSec, fps);
  }
  if (config.loopCrossfadeSec !== undefined) {
    bgmClip.loopCrossfadeFrames = secToFrames(config.loopCrossfadeSec, fps);
  }
  
  // Ducking configuration
  bgmClip.ducking = {
    enabled: config.ducking.enabled,
    duckDeltaDb: config.ducking.duckDeltaDb,
    attackFrames: Math.max(1, secToFrames(config.ducking.attackSec, fps)),
    releaseFrames: Math.max(1, secToFrames(config.ducking.releaseSec, fps)),
    mergeGapFrames: secToFrames(config.ducking.mergeGapSec, fps),
    minHoldFrames: secToFrames(config.ducking.minHoldSec, fps),
  };
  
  // Transition configuration (for scene crossfade)
  if (transitionInFrames !== undefined) {
    bgmClip.transitionInFrames = transitionInFrames;
  }
  if (transitionOutFrames !== undefined) {
    bgmClip.transitionOutFrames = transitionOutFrames;
  }
  
  return bgmClip;
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
