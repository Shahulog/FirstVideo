/**
 * BgmTrack Component (Pro Quality)
 * 
 * Renders BGM clips from the timeline with:
 * - Fade in/out
 * - Loop support with crossfade
 * - Ducking with anti-wobble (mergeGap, minHold)
 * - Idle boost (volume up when no one is talking)
 * - Scene transitions (clip crossfade)
 * - Max gain clamp (clip prevention)
 * 
 * Volume Priority Order:
 * - Base volume: volumeDb > volume > DEFAULT_BASE_DB (-12)
 * - Ducking: duckDeltaDb > duckVolumeDb > duckVolume > DEFAULT_DUCK_DELTA_DB (-8)
 * 
 * Conversion: gain = 10^(dB/20)
 */
import React, { useMemo } from "react";
import { Audio, Sequence, Loop, useCurrentFrame } from "remotion";
import { staticFile } from "remotion";
import type { 
  BgmTrack as BgmTrackType, 
  TimelineAssets,
  CharacterTrack as CharacterTrackType,
  BgmClip,
  BgmDucking,
} from "../../../../spec/timeline.schema";
import { 
  dbToGain, 
  clamp, 
  DEFAULT_BASE_DB, 
  DEFAULT_DUCK_DELTA_DB,
  VOLUME_DB_MIN,
  VOLUME_DB_MAX,
  DUCK_DELTA_DB_MIN,
  DUCK_DELTA_DB_MAX,
} from "../../../domain/audio";

// ============================================================
// Constants
// ============================================================

const DEFAULT_MAX_GAIN_DB = -3;
const DEFAULT_IDLE_BOOST_DB = 3;

interface BgmTrackProps {
  track: BgmTrackType;
  assets: TimelineAssets;
  /** Character track for ducking calculation */
  characterTrack?: CharacterTrackType;
}

// ============================================================
// Interval types and utilities
// ============================================================

interface Interval {
  start: number;
  end: number;
}

/**
 * Extract talking intervals from character track
 */
function getTalkingIntervals(
  characterTrack: CharacterTrackType | undefined
): Interval[] {
  if (!characterTrack) return [];
  
  return characterTrack.clips
    .filter((clip) => clip.state.isTalking)
    .map((clip) => ({
      start: clip.start,
      end: clip.start + clip.duration,
    }));
}

/**
 * Stabilize intervals with mergeGap and minHold (anti-wobble)
 * 
 * @param intervals - Raw talking intervals
 * @param mergeGapFrames - Merge intervals closer than this
 * @param minHoldFrames - Extend short intervals to at least this duration
 * @param maxEndFrame - Maximum end frame (clip/video boundary)
 */
function stabilizeIntervals(
  intervals: Interval[],
  mergeGapFrames: number,
  minHoldFrames: number,
  maxEndFrame: number
): Interval[] {
  if (intervals.length === 0) return [];
  
  // Sort by start
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  
  // Apply minHold first
  const held = sorted.map((interval) => ({
    start: interval.start,
    end: Math.min(maxEndFrame, Math.max(interval.end, interval.start + minHoldFrames)),
  }));
  
  // Merge intervals with small gaps
  const merged: Interval[] = [];
  let current = held[0];
  
  for (let i = 1; i < held.length; i++) {
    const next = held[i];
    
    // Check if gap is small enough to merge
    if (next.start <= current.end + mergeGapFrames) {
      // Merge: extend current to include next
      current = {
        start: current.start,
        end: Math.max(current.end, next.end),
      };
    } else {
      // Gap is too large, save current and start new
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  
  return merged;
}

// ============================================================
// Gain calculation utilities
// ============================================================

/**
 * Calculate base gain from clip settings
 * Priority: volumeDb > volume > DEFAULT_BASE_DB
 */
function getBaseGain(clip: BgmClip): number {
  if (clip.volumeDb !== undefined) {
    return dbToGain(clamp(clip.volumeDb, VOLUME_DB_MIN, VOLUME_DB_MAX));
  }
  if (clip.volume !== undefined) {
    return clamp(clip.volume, 0, 1);
  }
  return dbToGain(DEFAULT_BASE_DB);
}

/**
 * Calculate idle gain (when no one is talking)
 * Applies idleBoostDb on top of base gain
 */
function getIdleGain(clip: BgmClip, baseGain: number): number {
  const idleBoostDb = clip.idleBoostDb ?? DEFAULT_IDLE_BOOST_DB;
  return baseGain * dbToGain(idleBoostDb);
}

/**
 * Calculate talk gain (during dialogue)
 * Priority: duckDeltaDb > duckVolumeDb > duckVolume > DEFAULT_DUCK_DELTA_DB
 */
function getTalkGain(
  clip: BgmClip,
  baseGain: number
): number {
  const ducking = clip.ducking;
  if (!ducking || !ducking.enabled) {
    // Ducking disabled, use base gain
    return baseGain;
  }

  // Priority 1 (HIGHEST): duckDeltaDb - relative dB reduction
  if (ducking.duckDeltaDb !== undefined) {
    const clampedDelta = clamp(ducking.duckDeltaDb, DUCK_DELTA_DB_MIN, DUCK_DELTA_DB_MAX);
    return baseGain * dbToGain(clampedDelta);
  }

  // Priority 2: duckVolumeDb - absolute dB level
  if (ducking.duckVolumeDb !== undefined) {
    return dbToGain(clamp(ducking.duckVolumeDb, VOLUME_DB_MIN, VOLUME_DB_MAX));
  }

  // Priority 3 (LOWEST): duckVolume - multiplier
  if (ducking.duckVolume !== undefined) {
    return baseGain * clamp(ducking.duckVolume, 0, 1);
  }

  // Default: -8 dB delta
  return baseGain * dbToGain(DEFAULT_DUCK_DELTA_DB);
}

/**
 * Calculate max gain from clip settings (for clipping prevention)
 */
function getMaxGain(clip: BgmClip): number {
  const maxGainDb = clip.maxGainDb ?? DEFAULT_MAX_GAIN_DB;
  return dbToGain(clamp(maxGainDb, VOLUME_DB_MIN, VOLUME_DB_MAX));
}

/**
 * Calculate smoothed ducking gain with attack/release
 * 
 * Returns interpolated gain between talkGain and idleGain
 */
function calculateDuckedGain(
  globalFrame: number,
  duckIntervals: Interval[],
  idleGain: number,
  talkGain: number,
  attackFrames: number,
  releaseFrames: number
): number {
  // Guard against zero division
  const safeAttackFrames = Math.max(1, attackFrames);
  const safeReleaseFrames = Math.max(1, releaseFrames);

  // Find if we're in a ducking interval, approaching one, or leaving one
  let isInDucking = false;
  let minDistanceToStart = Infinity;
  let minDistanceFromEnd = Infinity;

  for (const interval of duckIntervals) {
    if (globalFrame >= interval.start && globalFrame < interval.end) {
      isInDucking = true;
      break;
    }

    // Distance to upcoming interval (for attack)
    if (globalFrame < interval.start) {
      minDistanceToStart = Math.min(minDistanceToStart, interval.start - globalFrame);
    }

    // Distance from end of past interval (for release)
    if (globalFrame >= interval.end) {
      minDistanceFromEnd = Math.min(minDistanceFromEnd, globalFrame - interval.end);
    }
  }

  // If in ducking interval, return talk gain
  if (isInDucking) {
    return talkGain;
  }

  // Attack phase: approaching a ducking interval
  if (minDistanceToStart <= safeAttackFrames) {
    const attackProgress = 1 - (minDistanceToStart / safeAttackFrames);
    return idleGain - (idleGain - talkGain) * attackProgress;
  }

  // Release phase: leaving a ducking interval
  if (minDistanceFromEnd < safeReleaseFrames) {
    // Check if there's an upcoming interval within attack range
    const hasUpcomingDuck = minDistanceToStart <= safeAttackFrames;
    if (!hasUpcomingDuck) {
      const releaseProgress = minDistanceFromEnd / safeReleaseFrames;
      return talkGain + (idleGain - talkGain) * releaseProgress;
    }
  }

  // Outside all intervals - use idle gain
  return idleGain;
}

// ============================================================
// BgmClip Component
// ============================================================

/**
 * BgmClip component that handles volume calculation and rendering
 */
const BgmClipComponent: React.FC<{
  clip: BgmClip;
  src: string;
  loopDurationFrames: number | undefined;
  duckIntervals: Interval[];
}> = ({
  clip,
  src,
  loopDurationFrames,
  duckIntervals,
}) => {
  const frame = useCurrentFrame();

  // Pre-calculate gains and parameters (memoized)
  const params = useMemo(() => {
    const baseGain = getBaseGain(clip);
    const idleGain = getIdleGain(clip, baseGain);
    const talkGain = getTalkGain(clip, baseGain);
    const maxGain = getMaxGain(clip);
    
    const ducking = clip.ducking;
    const duckingEnabled = ducking?.enabled ?? true;
    
    return {
      baseGain,
      idleGain,
      talkGain,
      maxGain,
      duckingEnabled,
      fadeInFrames: Math.max(1, clip.fadeInFrames ?? 30),
      fadeOutFrames: Math.max(1, clip.fadeOutFrames ?? 30),
      attackFrames: ducking?.attackFrames ?? 3,
      releaseFrames: ducking?.releaseFrames ?? 8,
      transitionInFrames: clip.transitionInFrames,
      transitionOutFrames: clip.transitionOutFrames,
    };
  }, [clip]);
  
  // Calculate volume at current frame
  const volume = useMemo(() => {
    const {
      idleGain,
      talkGain,
      maxGain,
      duckingEnabled,
      fadeInFrames,
      fadeOutFrames,
      attackFrames,
      releaseFrames,
      transitionInFrames,
      transitionOutFrames,
    } = params;
    
    const globalFrame = clip.start + frame;

    // Start with idle gain or ducked gain
    let currentGain = idleGain;
    
    if (duckingEnabled && duckIntervals.length > 0) {
      currentGain = calculateDuckedGain(
        globalFrame,
        duckIntervals,
        idleGain,
        talkGain,
        attackFrames,
        releaseFrames
      );
    }
    
    // Apply fade in (0 -> 1)
    let fadeInMul = 1;
    if (frame < fadeInFrames) {
      fadeInMul = frame / fadeInFrames;
    }
    
    // Apply fade out (1 -> 0)
    let fadeOutMul = 1;
    const fadeOutStart = clip.duration - fadeOutFrames;
    if (frame >= fadeOutStart && fadeOutFrames > 0) {
      fadeOutMul = Math.max(0, 1 - (frame - fadeOutStart) / fadeOutFrames);
    }
    
    // Apply transition in (for scene crossfade)
    let transitionInMul = 1;
    if (transitionInFrames !== undefined && transitionInFrames > 0 && frame < transitionInFrames) {
      transitionInMul = frame / transitionInFrames;
    }
    
    // Apply transition out (for scene crossfade)
    let transitionOutMul = 1;
    if (transitionOutFrames !== undefined && transitionOutFrames > 0) {
      const transitionOutStart = clip.duration - transitionOutFrames;
      if (frame >= transitionOutStart) {
        transitionOutMul = Math.max(0, 1 - (frame - transitionOutStart) / transitionOutFrames);
      }
    }
    
    // Combine all multipliers
    const finalGain = currentGain * fadeInMul * fadeOutMul * transitionInMul * transitionOutMul;
    
    // Clamp to maxGain to prevent clipping
    return clamp(finalGain, 0, maxGain);
  }, [
    frame,
    clip.start,
    clip.duration,
    params,
    duckIntervals,
  ]);
  
  // Render audio with optional looping
  const audioElement = (
    <Audio
      src={staticFile(src)}
      volume={volume}
    />
  );
  
  // Determine if we should loop
  const shouldLoop = (clip.loop ?? true) && loopDurationFrames !== undefined && loopDurationFrames > 0;
  
  if (shouldLoop) {
    // Use Loop component with actual audio duration
    // Note: loopStartFrames/loopEndFrames/loopCrossfadeFrames are advanced features
    // For now, we use simple looping with the full audio duration
    return (
      <Loop durationInFrames={loopDurationFrames}>
        {audioElement}
      </Loop>
    );
  }
  
  // Single playback (no loop or duration unknown)
  return audioElement;
};

// ============================================================
// Main BgmTrack Component
// ============================================================

export const BgmTrack: React.FC<BgmTrackProps> = ({ track, assets, characterTrack }) => {
  // Get raw talking intervals
  const rawTalkingIntervals = useMemo(
    () => getTalkingIntervals(characterTrack),
    [characterTrack]
  );
  
  return (
    <>
      {track.clips.map((clip, index) => {
        const asset = assets.bgm?.[clip.assetId];
        if (!asset) {
          console.warn(`[BgmTrack] Asset not found: ${clip.assetId}`);
          return null;
        }
        
        // Get stabilization parameters from clip
        const mergeGapFrames = clip.ducking?.mergeGapFrames ?? 10;
        const minHoldFrames = clip.ducking?.minHoldFrames ?? 18;
        
        // Stabilize intervals (anti-wobble)
        const duckIntervals = stabilizeIntervals(
          rawTalkingIntervals,
          mergeGapFrames,
          minHoldFrames,
          clip.start + clip.duration
        );
        
        // Get loop duration from asset
        const loopDurationFrames = asset.durationFrames;
        
        return (
          <Sequence
            key={`bgm-${index}-${clip.assetId}`}
            from={clip.start}
            durationInFrames={clip.duration}
            layout="none"
          >
            <BgmClipComponent
              clip={clip}
              src={asset.src}
              loopDurationFrames={loopDurationFrames}
              duckIntervals={duckIntervals}
            />
          </Sequence>
        );
      })}
    </>
  );
};
