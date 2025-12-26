/**
 * SubtitleTrack Component
 * 
 * Renders subtitle clips from the timeline using Remotion's Sequence.
 * Reuses the existing TextOverlay component.
 */
import React from "react";
import { Sequence } from "remotion";
import type { SubtitleTrack as SubtitleTrackType } from "../../../../spec/timeline.schema";
import { TextOverlay } from "../../../Video/TextOverlay";

interface SubtitleTrackProps {
  track: SubtitleTrackType;
}

export const SubtitleTrack: React.FC<SubtitleTrackProps> = ({ track }) => {
  return (
    <>
      {track.clips.map((clip, index) => (
        <Sequence
          key={`subtitle-${index}-${clip.start}`}
          from={clip.start}
          durationInFrames={clip.duration}
          layout="none"
        >
          <TextOverlay title="" subtitle={clip.text} />
        </Sequence>
      ))}
    </>
  );
};

