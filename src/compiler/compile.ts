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
 * Serialize BGM config for comparison (stable JSON)
 */
function serializeConfig(config: ResolvedBgmConfig): string {
  // Create a stable representation for comparison
  return JSON.stringify({
    src: config.src,
    volumeDb: config.volumeDb,
    maxGainDb: config.maxGainDb,
    fadeInSec: config.fadeInSec,
    fadeOutSec: config.fadeOutSec,
    loop: config.loop,
    loopStartSec: config.loopStartSec,
    loopEndSec: config.loopEndSec,
    loopCrossfadeSec: config.loopCrossfadeSec,
    idleBoostDb: config.idleBoostDb,
    ducking: config.ducking,
  });
}

/**
 * Generate BGM track with change-based clip splitting
 * 
 * Rules:
 * - Only create new clip when config changes (src or settings)
 * - If same config, extend previous clip
 * - On src change, create crossfade overlap
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
  
  if (sceneTimings.length === 0) {
    // No scenes, create single clip for entire timeline
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
    
    return { bgmAssets, bgmTrack: { type: "bgm", clips: bgmClips } };
  }
  
  // Track current clip state
  let currentClip: BgmClip | null = null;
  let currentConfig: ResolvedBgmConfig | null = null;
  let currentConfigStr = "";
  let currentAssetId = "";
  
  for (let i = 0; i < sceneTimings.length; i++) {
    const { startFrame, endFrame, scene } = sceneTimings[i];
    const sceneOverride = scene.style?.bgm;
    const isFirstScene = i === 0;
    const isLastScene = i === sceneTimings.length - 1;
    
    // Resolve BGM config for this scene
    const config = resolveBgmConfig(videoBgm, sceneOverride);
    const configStr = serializeConfig(config);
    const assetId = generateBgmAssetId(config.src);
    
    // Add asset if not already present
    if (!bgmAssets[assetId]) {
      const durationFrames = bgmDurationFrames?.[assetId];
      bgmAssets[assetId] = {
        src: config.src,
        ...(durationFrames !== undefined && { durationFrames }),
      };
    }
    
    // Check if config changed
    const configChanged = currentConfigStr !== configStr;
    const srcChanged = currentAssetId !== "" && currentAssetId !== assetId;
    
    if (isFirstScene || configChanged) {
      // Need to create a new clip
      
      // First, finalize previous clip if exists
      if (currentClip !== null && srcChanged) {
        // Src changed - set up crossfade
        const transitionSec = sceneOverride?.transitionSec ?? DEFAULT_TRANSITION_SEC;
        const transitionFrames = Math.max(1, secToFrames(transitionSec, fps));
        
        // Extend previous clip to overlap into the transition period
        // oldClip ends at startFrame + transitionFrames
        currentClip.duration = startFrame + transitionFrames - currentClip.start;
        currentClip.transitionOutFrames = transitionFrames;
        
        // New clip starts at startFrame (NOT earlier)
        // New clip has transitionIn
        const newClip = createBgmClip(
          assetId,
          startFrame,
          endFrame - startFrame,
          config,
          fps,
          {
            isFirstClip: false, // Not first overall, has transition
            isLastClip: isLastScene,
            transitionInFrames: transitionFrames,
          }
        );
        
        bgmClips.push(currentClip);
        currentClip = newClip;
      } else if (currentClip !== null) {
        // Settings changed but not src - no crossfade needed, just split
        // Finalize previous clip at scene boundary
        currentClip.duration = startFrame - currentClip.start;
        bgmClips.push(currentClip);
        
        // Create new clip
        currentClip = createBgmClip(
          assetId,
          startFrame,
          endFrame - startFrame,
          config,
          fps,
          {
            isFirstClip: false,
            isLastClip: isLastScene,
          }
        );
      } else {
        // First clip
        currentClip = createBgmClip(
          assetId,
          startFrame,
          endFrame - startFrame,
          config,
          fps,
          {
            isFirstClip: true,
            isLastClip: isLastScene,
          }
        );
      }
      
      currentConfig = config;
      currentConfigStr = configStr;
      currentAssetId = assetId;
    } else {
      // Config is the same - extend current clip
      if (currentClip !== null) {
        currentClip.duration = endFrame - currentClip.start;
        // Update isLastClip
        if (isLastScene) {
          currentClip.fadeOutFrames = Math.max(1, secToFrames(config.fadeOutSec, fps));
        }
      }
    }
  }
  
  // Don't forget to push the final clip
  if (currentClip !== null) {
    bgmClips.push(currentClip);
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
  if (config.loopCrossfadeSec !== undefined && config.loopCrossfadeSec > 0) {
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
