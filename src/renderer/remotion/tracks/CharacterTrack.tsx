/**
 * CharacterTrack Component
 * 
 * Renders character clips from the timeline using Remotion's Sequence.
 * Reuses the existing Character component.
 */
import React from "react";
import { Sequence } from "remotion";
import type { CharacterTrack as CharacterTrackType } from "../../../../spec/timeline.schema";
import { Character } from "../../../Video/Character";

interface CharacterTrackProps {
  track: CharacterTrackType;
}

export const CharacterTrack: React.FC<CharacterTrackProps> = ({ track }) => {
  return (
    <>
      {track.clips.map((clip, index) => (
        <Sequence
          key={`character-${index}-${clip.characterId}-${clip.start}`}
          from={clip.start}
          durationInFrames={clip.duration}
          layout="none"
        >
          <div className="absolute bottom-[-100px] right-10 w-[400px] h-[500px]">
            <Character isTalking={clip.state.isTalking} />
          </div>
        </Sequence>
      ))}
    </>
  );
};

