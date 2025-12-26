/**
 * AudioTrack Component
 * 
 * Renders audio clips from the timeline using Remotion's Sequence and Audio.
 */
import React from "react";
import { Audio, Sequence, staticFile } from "remotion";
import type { AudioTrack as AudioTrackType, TimelineAssets } from "../../../../spec/timeline.schema";

interface AudioTrackProps {
  track: AudioTrackType;
  assets: TimelineAssets;
}

export const AudioTrack: React.FC<AudioTrackProps> = ({ track, assets }) => {
  return (
    <>
      {track.clips.map((clip, index) => {
        const asset = assets.audio[clip.assetId];
        if (!asset) {
          console.warn(`[AudioTrack] Asset not found: ${clip.assetId}`);
          return null;
        }
        
        return (
          <Sequence
            key={`audio-${index}-${clip.assetId}`}
            from={clip.start}
            durationInFrames={clip.duration}
            layout="none"
          >
            <Audio src={staticFile(asset.src)} volume={1} />
          </Sequence>
        );
      })}
    </>
  );
};

