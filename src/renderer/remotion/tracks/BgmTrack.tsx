/**
 * BgmTrack Component (Pro Quality)
 * 
 * Renders BGM clips from the timeline with:
 * - Fade in/out
 * - Loop support with loop points and crossfade
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
import { Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { staticFile } from "remotion";
import type { 
  BgmTrack as BgmTrackType, 
  TimelineAssets,
  CharacterTrack as CharacterTrackType,
  BgmClip,
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
 */
function stabilizeIntervals(
  intervals: Interval[],
  mergeGapFrames: number,
  minHoldFrames: number,
  maxEndFrame: number
): Interval[] {
  if (intervals.length === 0) return [];
  
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  
  // Apply minHold
  const held = sorted.map((interval) => ({
    start: interval.start,
    end: Math.min(maxEndFrame, Math.max(interval.end, interval.start + minHoldFrames)),
  }));
  
  // Merge intervals with small gaps
  const merged: Interval[] = [];
  let current = held[0];
  
  for (let i = 1; i < held.length; i++) {
    const next = held[i];
    if (next.start <= current.end + mergeGapFrames) {
      current = { start: current.start, end: Math.max(current.end, next.end) };
    } else {
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
 */
function getIdleGain(clip: BgmClip, baseGain: number): number {
  const idleBoostDb = clip.idleBoostDb ?? DEFAULT_IDLE_BOOST_DB;
  return baseGain * dbToGain(idleBoostDb);
}

/**
 * Calculate talk gain (during dialogue)
 * Priority: duckDeltaDb > duckVolumeDb > duckVolume > DEFAULT_DUCK_DELTA_DB
 */
function getTalkGain(clip: BgmClip, baseGain: number): number {
  const ducking = clip.ducking;
  if (!ducking || !ducking.enabled) {
    return baseGain;
  }

  // Priority 1: duckDeltaDb (relative dB reduction)
  if (ducking.duckDeltaDb !== undefined) {
    const clampedDelta = clamp(ducking.duckDeltaDb, DUCK_DELTA_DB_MIN, DUCK_DELTA_DB_MAX);
    return baseGain * dbToGain(clampedDelta);
  }

  // Priority 2: duckVolumeDb (absolute dB level)
  if (ducking.duckVolumeDb !== undefined) {
    return dbToGain(clamp(ducking.duckVolumeDb, VOLUME_DB_MIN, VOLUME_DB_MAX));
  }

  // Priority 3: duckVolume (multiplier)
  if (ducking.duckVolume !== undefined) {
    return baseGain * clamp(ducking.duckVolume, 0, 1);
  }

  // Default: -8 dB delta
  return baseGain * dbToGain(DEFAULT_DUCK_DELTA_DB);
}

/**
 * Calculate max gain (for clipping prevention)
 */
function getMaxGain(clip: BgmClip): number {
  const maxGainDb = clip.maxGainDb ?? DEFAULT_MAX_GAIN_DB;
  return dbToGain(clamp(maxGainDb, VOLUME_DB_MIN, VOLUME_DB_MAX));
}

/**
 * Calculate smoothed ducking gain with attack/release
 */
function calculateDuckedGain(
  globalFrame: number,
  duckIntervals: Interval[],
  idleGain: number,
  talkGain: number,
  attackFrames: number,
  releaseFrames: number
): number {
  const safeAttackFrames = Math.max(1, attackFrames);
  const safeReleaseFrames = Math.max(1, releaseFrames);

  let isInDucking = false;
  let minDistanceToStart = Infinity;
  let minDistanceFromEnd = Infinity;

  for (const interval of duckIntervals) {
    if (globalFrame >= interval.start && globalFrame < interval.end) {
      isInDucking = true;
      break;
    }
    if (globalFrame < interval.start) {
      minDistanceToStart = Math.min(minDistanceToStart, interval.start - globalFrame);
    }
    if (globalFrame >= interval.end) {
      minDistanceFromEnd = Math.min(minDistanceFromEnd, globalFrame - interval.end);
    }
  }

  if (isInDucking) return talkGain;

  // Attack phase
  if (minDistanceToStart <= safeAttackFrames) {
    const progress = 1 - (minDistanceToStart / safeAttackFrames);
    return idleGain - (idleGain - talkGain) * progress;
  }

  // Release phase
  if (minDistanceFromEnd < safeReleaseFrames) {
    const hasUpcomingDuck = minDistanceToStart <= safeAttackFrames;
    if (!hasUpcomingDuck) {
      const progress = minDistanceFromEnd / safeReleaseFrames;
      return talkGain + (idleGain - talkGain) * progress;
    }
  }

  return idleGain;
}

// ============================================================
// Loop Segment Generation
// ============================================================

interface LoopSegment {
  /** Frame offset within the clip where this segment starts */
  clipOffset: number;
  /** Duration of this segment in frames */
  duration: number;
  /** Start position in audio file (frames from audio start) */
  audioStartFrame: number;
  /** Crossfade in multiplier (0-1) over crossfade period at start */
  fadeInFrames: number;
  /** Crossfade out multiplier (1-0) over crossfade period at end */
  fadeOutFrames: number;
}

/**
 * Generate loop segments for a clip with loop points and crossfade
 * 
 * This creates overlapping segments where:
 * - Each segment plays the loop region (loopStart to loopEnd)
 * - Segments overlap by loopCrossfadeFrames
 * - Overlapping region: outgoing fades 1→0, incoming fades 0→1
 */
function generateLoopSegments(
  clipDuration: number,
  audioDurationFrames: number,
  loopStartFrames: number | undefined,
  loopEndFrames: number | undefined,
  loopCrossfadeFrames: number | undefined,
  fps: number
): LoopSegment[] {
  // Determine loop region
  const loopStart = loopStartFrames ?? 0;
  let loopEnd = loopEndFrames ?? audioDurationFrames;
  
  // Validate loop region
  if (loopEnd <= loopStart || loopStart < 0 || loopEnd > audioDurationFrames) {
    // Invalid loop region, use full audio
    loopEnd = audioDurationFrames;
  }
  
  const loopLength = loopEnd - loopStart;
  if (loopLength <= 0) {
    // Fallback: single play with no loop
    return [{
      clipOffset: 0,
      duration: Math.min(clipDuration, audioDurationFrames),
      audioStartFrame: 0,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    }];
  }
  
  const crossfade = loopCrossfadeFrames ?? 0;
  const effectiveCrossfade = Math.min(crossfade, Math.floor(loopLength / 2));
  
  const segments: LoopSegment[] = [];
  let clipOffset = 0;
  let isFirst = true;
  
  while (clipOffset < clipDuration) {
    // First segment starts at audio start (not loop start)
    const audioStart = isFirst ? 0 : loopStart;
    // First segment plays until loopEnd, subsequent segments play loopStart to loopEnd
    const segmentAudioLength = isFirst ? loopEnd : loopLength;
    
    const remaining = clipDuration - clipOffset;
    const segmentDuration = Math.min(segmentAudioLength, remaining);
    
    // Crossfade settings
    // First segment: no fade in, fade out at end if there's another segment
    // Middle segments: fade in at start, fade out at end
    // Last segment: fade in at start, no fade out
    const isLast = clipOffset + segmentDuration >= clipDuration;
    
    segments.push({
      clipOffset,
      duration: segmentDuration + (isLast ? 0 : effectiveCrossfade),
      audioStartFrame: audioStart,
      fadeInFrames: isFirst ? 0 : effectiveCrossfade,
      fadeOutFrames: isLast ? 0 : effectiveCrossfade,
    });
    
    // Next segment starts at end minus crossfade (overlap)
    clipOffset += segmentDuration;
    isFirst = false;
    
    // Safety: prevent infinite loop
    if (segmentDuration <= 0) break;
  }
  
  return segments;
}

// ============================================================
// Loop Segment Audio Component
// ============================================================

interface LoopSegmentAudioProps {
  src: string;
  segment: LoopSegment;
  fps: number;
  volumeCalculator: (localFrame: number) => number;
}

const LoopSegmentAudio: React.FC<LoopSegmentAudioProps> = ({
  src,
  segment,
  fps,
  volumeCalculator,
}) => {
  const frame = useCurrentFrame();
  
  const volume = useMemo(() => {
    // Calculate base volume from ducking/fade
    const baseVol = volumeCalculator(segment.clipOffset + frame);
    
    // Apply crossfade multipliers
    let crossfadeMul = 1;
    
    // Fade in at segment start
    if (segment.fadeInFrames > 0 && frame < segment.fadeInFrames) {
      crossfadeMul *= frame / segment.fadeInFrames;
    }
    
    // Fade out at segment end
    if (segment.fadeOutFrames > 0) {
      const fadeOutStart = segment.duration - segment.fadeOutFrames;
      if (frame >= fadeOutStart) {
        crossfadeMul *= 1 - ((frame - fadeOutStart) / segment.fadeOutFrames);
      }
    }
    
    return baseVol * crossfadeMul;
  }, [frame, segment, volumeCalculator]);
  
  // Calculate startFrom in seconds
  const startFromSec = segment.audioStartFrame / fps;
  
  return (
    <Audio
      src={staticFile(src)}
      volume={volume}
      startFrom={Math.round(startFromSec * fps)}
    />
  );
};

// ============================================================
// BgmClip Component
// ============================================================

interface BgmClipComponentProps {
  clip: BgmClip;
  src: string;
  audioDurationFrames: number | undefined;
  duckIntervals: Interval[];
}

const BgmClipComponent: React.FC<BgmClipComponentProps> = ({
  clip,
  src,
  audioDurationFrames,
  duckIntervals,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pre-calculate gains and parameters
  const params = useMemo(() => {
    const baseGain = getBaseGain(clip);
    return {
      baseGain,
      idleGain: getIdleGain(clip, baseGain),
      talkGain: getTalkGain(clip, baseGain),
      maxGain: getMaxGain(clip),
      duckingEnabled: clip.ducking?.enabled ?? true,
      fadeInFrames: Math.max(1, clip.fadeInFrames ?? 30),
      fadeOutFrames: Math.max(1, clip.fadeOutFrames ?? 30),
      attackFrames: clip.ducking?.attackFrames ?? 3,
      releaseFrames: clip.ducking?.releaseFrames ?? 8,
      transitionInFrames: clip.transitionInFrames,
      transitionOutFrames: clip.transitionOutFrames,
    };
  }, [clip]);
  
  // Volume calculator function (for loop segments)
  const calculateVolume = useMemo(() => {
    return (localFrame: number): number => {
      const {
        idleGain, talkGain, maxGain, duckingEnabled,
        fadeInFrames, fadeOutFrames, attackFrames, releaseFrames,
        transitionInFrames, transitionOutFrames,
      } = params;
      
      const globalFrame = clip.start + localFrame;

      // Ducking
      let currentGain = idleGain;
      if (duckingEnabled && duckIntervals.length > 0) {
        currentGain = calculateDuckedGain(
          globalFrame, duckIntervals, idleGain, talkGain,
          attackFrames, releaseFrames
        );
      }
      
      // Fade in
      let fadeInMul = 1;
      if (localFrame < fadeInFrames) {
        fadeInMul = localFrame / fadeInFrames;
      }
      
      // Fade out
      let fadeOutMul = 1;
      const fadeOutStart = clip.duration - fadeOutFrames;
      if (localFrame >= fadeOutStart && fadeOutFrames > 0) {
        fadeOutMul = Math.max(0, 1 - (localFrame - fadeOutStart) / fadeOutFrames);
      }
      
      // Transition in (scene crossfade)
      let transitionInMul = 1;
      if (transitionInFrames !== undefined && transitionInFrames > 0 && localFrame < transitionInFrames) {
        transitionInMul = localFrame / transitionInFrames;
      }
      
      // Transition out (scene crossfade)
      let transitionOutMul = 1;
      if (transitionOutFrames !== undefined && transitionOutFrames > 0) {
        const transitionOutStart = clip.duration - transitionOutFrames;
        if (localFrame >= transitionOutStart) {
          transitionOutMul = Math.max(0, 1 - (localFrame - transitionOutStart) / transitionOutFrames);
        }
      }
      
      const finalGain = currentGain * fadeInMul * fadeOutMul * transitionInMul * transitionOutMul;
      return clamp(finalGain, 0, maxGain);
    };
  }, [clip, params, duckIntervals]);
  
  // Calculate current volume for non-looped playback
  const volume = useMemo(() => calculateVolume(frame), [calculateVolume, frame]);
  
  // Determine if looping is possible
  const shouldLoop = (clip.loop ?? true) && audioDurationFrames !== undefined && audioDurationFrames > 0;
  
  if (shouldLoop) {
    // Generate loop segments with crossfade
    const segments = generateLoopSegments(
      clip.duration,
      audioDurationFrames,
      clip.loopStartFrames,
      clip.loopEndFrames,
      clip.loopCrossfadeFrames,
      fps
    );
    
    return (
      <>
        {segments.map((segment, idx) => (
          <Sequence
            key={`loop-seg-${idx}`}
            from={segment.clipOffset}
            durationInFrames={segment.duration}
            layout="none"
          >
            <LoopSegmentAudio
              src={src}
              segment={segment}
              fps={fps}
              volumeCalculator={calculateVolume}
            />
          </Sequence>
        ))}
      </>
    );
  }
  
  // Single playback (no loop or duration unknown)
  return (
    <Audio
      src={staticFile(src)}
      volume={volume}
    />
  );
};

// ============================================================
// Main BgmTrack Component
// ============================================================

export const BgmTrack: React.FC<BgmTrackProps> = ({ track, assets, characterTrack }) => {
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
        
        const mergeGapFrames = clip.ducking?.mergeGapFrames ?? 10;
        const minHoldFrames = clip.ducking?.minHoldFrames ?? 18;
        
        const duckIntervals = stabilizeIntervals(
          rawTalkingIntervals,
          mergeGapFrames,
          minHoldFrames,
          clip.start + clip.duration
        );
        
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
              audioDurationFrames={asset.durationFrames}
              duckIntervals={duckIntervals}
            />
          </Sequence>
        );
      })}
    </>
  );
};
