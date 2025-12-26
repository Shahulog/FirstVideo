/**
 * BgmTrack Component
 * 
 * Renders BGM clips from the timeline with:
 * - Fade in/out
 * - Loop support
 * - Ducking (auto volume reduction during dialogue)
 */
import React, { useMemo } from "react";
import { Audio, Sequence, Loop, useCurrentFrame, useVideoConfig } from "remotion";
import { staticFile } from "remotion";
import type { 
  BgmTrack as BgmTrackType, 
  TimelineAssets,
  CharacterTrack as CharacterTrackType,
} from "../../../../spec/timeline.schema";

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
 * Check if a frame is within any talking interval
 */
function isFrameInTalkingInterval(
  frame: number,
  intervals: Array<{ start: number; end: number }>
): boolean {
  return intervals.some((interval) => frame >= interval.start && frame < interval.end);
}

/**
 * Calculate ducking multiplier with attack/release smoothing
 * Returns a value between duckVolume and 1.0
 */
function calculateDuckingMultiplier(
  frame: number,
  intervals: Array<{ start: number; end: number }>,
  duckVolume: number,
  attackFrames: number,
  releaseFrames: number
): number {
  // Find the nearest talking interval
  let minDistanceToTalking = Infinity;
  let isInTalking = false;
  
  for (const interval of intervals) {
    if (frame >= interval.start && frame < interval.end) {
      isInTalking = true;
      // Distance to end of talking (for release)
      minDistanceToTalking = 0;
      break;
    }
    
    // Distance to start of interval (for attack)
    if (frame < interval.start) {
      minDistanceToTalking = Math.min(minDistanceToTalking, interval.start - frame);
    }
    
    // Distance from end of interval (for release)
    if (frame >= interval.end) {
      const distFromEnd = frame - interval.end;
      if (distFromEnd < releaseFrames) {
        // We're in the release phase after this interval
        // Check if there's another interval starting soon
        const nextInterval = intervals.find(i => i.start > interval.end && i.start <= frame + attackFrames);
        if (!nextInterval) {
          // Calculate release progress
          const releaseProgress = distFromEnd / releaseFrames;
          return duckVolume + (1 - duckVolume) * releaseProgress;
        }
      }
    }
  }
  
  if (isInTalking) {
    return duckVolume;
  }
  
  // Attack phase: approaching a talking interval
  if (minDistanceToTalking <= attackFrames && minDistanceToTalking > 0) {
    const attackProgress = 1 - (minDistanceToTalking / attackFrames);
    return 1 - (1 - duckVolume) * attackProgress;
  }
  
  return 1.0;
}

/**
 * BgmClip component that handles volume calculation
 */
const BgmClipComponent: React.FC<{
  assetId: string;
  src: string;
  clipStart: number;
  clipDuration: number;
  baseVolume: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  loop: boolean;
  ducking?: {
    enabled: boolean;
    duckVolume: number;
    attackFrames: number;
    releaseFrames: number;
  };
  talkingIntervals: Array<{ start: number; end: number }>;
}> = ({
  src,
  clipStart,
  clipDuration,
  baseVolume,
  fadeInFrames,
  fadeOutFrames,
  loop,
  ducking,
  talkingIntervals,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Calculate volume at current frame
  const volume = useMemo(() => {
    const globalFrame = clipStart + frame;
    
    // Fade in multiplier (0 -> 1)
    let fadeInMul = 1;
    if (frame < fadeInFrames) {
      fadeInMul = frame / fadeInFrames;
    }
    
    // Fade out multiplier (1 -> 0)
    let fadeOutMul = 1;
    const fadeOutStart = clipDuration - fadeOutFrames;
    if (frame >= fadeOutStart) {
      fadeOutMul = 1 - (frame - fadeOutStart) / fadeOutFrames;
    }
    
    // Ducking multiplier
    let duckMul = 1;
    if (ducking?.enabled) {
      duckMul = calculateDuckingMultiplier(
        globalFrame,
        talkingIntervals,
        ducking.duckVolume,
        ducking.attackFrames,
        ducking.releaseFrames
      );
    }
    
    return baseVolume * fadeInMul * fadeOutMul * duckMul;
  }, [frame, clipStart, clipDuration, baseVolume, fadeInFrames, fadeOutFrames, ducking, talkingIntervals]);
  
  // Estimate audio duration for loop (30 seconds default, will be overridden by actual file)
  const estimatedAudioDuration = 30 * fps;
  
  const audioElement = (
    <Audio
      src={staticFile(src)}
      volume={volume}
    />
  );
  
  if (loop) {
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
              assetId={clip.assetId}
              src={asset.src}
              clipStart={clip.start}
              clipDuration={clip.duration}
              baseVolume={clip.volume ?? 0.25}
              fadeInFrames={clip.fadeInFrames ?? 30}
              fadeOutFrames={clip.fadeOutFrames ?? 30}
              loop={clip.loop ?? true}
              ducking={clip.ducking}
              talkingIntervals={talkingIntervals}
            />
          </Sequence>
        );
      })}
    </>
  );
};

