/**
 * BgmTrack Component
 * 
 * Renders BGM clips from the timeline with:
 * - Fade in/out
 * - Loop support
 * - Ducking (auto volume reduction during dialogue)
 * 
 * Volume Priority Order:
 * - Base volume: volumeDb > volume > DEFAULT_BASE_DB (-12)
 * - Ducking: duckDeltaDb > duckVolumeDb > duckVolume > DEFAULT_DUCK_DELTA_DB (-8)
 * 
 * Conversion: gain = 10^(dB/20)
 */
import React, { useMemo } from "react";
import { Audio, Sequence, Loop, useCurrentFrame, useVideoConfig } from "remotion";
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

interface BgmTrackProps {
  track: BgmTrackType;
  assets: TimelineAssets;
  /** Character track for ducking calculation */
  characterTrack?: CharacterTrackType;
}

/**
 * Extract talking intervals from character track
 */
function getTalkingIntervals(
  characterTrack: CharacterTrackType | undefined
): Array<{ start: number; end: number }> {
  if (!characterTrack) return [];
  
  return characterTrack.clips
    .filter((clip) => clip.state.isTalking)
    .map((clip) => ({
      start: clip.start,
      end: clip.start + clip.duration,
    }));
}

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
 * Calculate target gain during talking (ducked gain)
 * Priority: duckDeltaDb > duckVolumeDb > duckVolume > DEFAULT_DUCK_DELTA_DB
 * 
 * duckDeltaDb: baseGain * 10^(duckDeltaDb/20) - relative reduction
 * duckVolumeDb: 10^(duckVolumeDb/20) - absolute level
 * duckVolume: baseGain * duckVolume - multiplier
 */
function getTalkGain(
  clip: BgmClip,
  baseGain: number
): number {
  const ducking = clip.ducking;
  if (!ducking) {
    // Default ducking with duckDeltaDb = -8
    return baseGain * dbToGain(DEFAULT_DUCK_DELTA_DB);
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
 * Calculate ducking multiplier with attack/release smoothing
 * Returns the interpolated gain between talkGain and baseGain
 */
function calculateDuckedGain(
  frame: number,
  intervals: Array<{ start: number; end: number }>,
  baseGain: number,
  talkGain: number,
  attackFrames: number,
  releaseFrames: number
): number {
  // Guard against zero division
  const safeAttackFrames = Math.max(1, attackFrames);
  const safeReleaseFrames = Math.max(1, releaseFrames);

  // Find if we're in a talking interval, approaching one, or leaving one
  let isInTalking = false;
  let minDistanceToStart = Infinity;
  let minDistanceFromEnd = Infinity;

  for (const interval of intervals) {
    if (frame >= interval.start && frame < interval.end) {
      isInTalking = true;
      break;
    }

    // Distance to upcoming interval (for attack)
    if (frame < interval.start) {
      minDistanceToStart = Math.min(minDistanceToStart, interval.start - frame);
    }

    // Distance from end of past interval (for release)
    if (frame >= interval.end) {
      minDistanceFromEnd = Math.min(minDistanceFromEnd, frame - interval.end);
    }
  }

  // If in talking interval, return talk gain
  if (isInTalking) {
    return talkGain;
  }

  // Attack phase: approaching a talking interval
  if (minDistanceToStart <= safeAttackFrames) {
    const attackProgress = 1 - (minDistanceToStart / safeAttackFrames);
    return baseGain - (baseGain - talkGain) * attackProgress;
  }

  // Release phase: leaving a talking interval
  if (minDistanceFromEnd < safeReleaseFrames) {
    // Check if there's an upcoming interval within attack range
    const hasUpcomingTalk = minDistanceToStart <= safeAttackFrames;
    if (!hasUpcomingTalk) {
      const releaseProgress = minDistanceFromEnd / safeReleaseFrames;
      return talkGain + (baseGain - talkGain) * releaseProgress;
    }
  }

  return baseGain;
}

/**
 * BgmClip component that handles volume calculation
 */
const BgmClipComponent: React.FC<{
  clip: BgmClip;
  src: string;
  talkingIntervals: Array<{ start: number; end: number }>;
}> = ({
  clip,
  src,
  talkingIntervals,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pre-calculate gains (memoized for performance)
  const { baseGain, talkGain, fadeInFrames, fadeOutFrames, attackFrames, releaseFrames } = useMemo(() => {
    const bg = getBaseGain(clip);
    const tg = getTalkGain(clip, bg);
    return {
      baseGain: bg,
      talkGain: tg,
      fadeInFrames: Math.max(1, clip.fadeInFrames ?? 30),
      fadeOutFrames: Math.max(1, clip.fadeOutFrames ?? 30),
      attackFrames: clip.ducking?.attackFrames ?? 3,
      releaseFrames: clip.ducking?.releaseFrames ?? 6,
    };
  }, [clip]);
  
  // Calculate volume at current frame
  const volume = useMemo(() => {
    const globalFrame = clip.start + frame;
    const isDuckingEnabled = clip.ducking?.enabled ?? true;

    // Guard: if baseGain is 0, return 0
    if (baseGain === 0) return 0;

    // Fade in multiplier (0 -> 1)
    let fadeInMul = 1;
    if (frame < fadeInFrames) {
      fadeInMul = frame / fadeInFrames;
    }
    
    // Fade out multiplier (1 -> 0)
    let fadeOutMul = 1;
    const fadeOutStart = clip.duration - fadeOutFrames;
    if (frame >= fadeOutStart) {
      fadeOutMul = 1 - (frame - fadeOutStart) / fadeOutFrames;
    }
    
    // Calculate ducked gain
    let currentGain = baseGain;
    if (isDuckingEnabled && talkingIntervals.length > 0) {
      currentGain = calculateDuckedGain(
        globalFrame,
        talkingIntervals,
        baseGain,
        talkGain,
        attackFrames,
        releaseFrames
      );
    }
    
    // Final volume = duckedGain * fadeMul
    // Note: fadeInMul and fadeOutMul apply to the current gain level
    return currentGain * fadeInMul * fadeOutMul;
  }, [
    frame, 
    clip.start, 
    clip.duration, 
    baseGain,
    talkGain,
    fadeInFrames, 
    fadeOutFrames, 
    attackFrames,
    releaseFrames,
    clip.ducking?.enabled,
    talkingIntervals
  ]);
  
  // Estimate audio duration for loop (30 seconds default, will be overridden by actual file)
  const estimatedAudioDuration = 30 * fps;
  
  const audioElement = (
    <Audio
      src={staticFile(src)}
      volume={volume}
    />
  );
  
  if (clip.loop ?? true) {
    return (
      <Loop durationInFrames={estimatedAudioDuration}>
        {audioElement}
      </Loop>
    );
  }
  
  return audioElement;
};

export const BgmTrack: React.FC<BgmTrackProps> = ({ track, assets, characterTrack }) => {
  // Get talking intervals for ducking
  const talkingIntervals = useMemo(
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
              talkingIntervals={talkingIntervals}
            />
          </Sequence>
        );
      })}
    </>
  );
};
