/**
 * Timeline Renderer
 * 
 * Main component that takes a Timeline and renders it using Remotion.
 * Orchestrates all track renderers.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import type { Timeline } from "../../../spec/timeline.schema";
import { getAudioTrack, getSubtitleTrack, getCharacterTrack } from "../../../spec/timeline.schema";
import { AudioTrack } from "./tracks/AudioTrack";
import { SubtitleTrack } from "./tracks/SubtitleTrack";
import { CharacterTrack } from "./tracks/CharacterTrack";
import { Background } from "../../Video/Background";

interface RenderTimelineProps {
  timeline: Timeline;
  titleText?: string;
}

export const RenderTimeline: React.FC<RenderTimelineProps> = ({ 
  timeline, 
  titleText = "" 
}) => {
  const audioTrack = getAudioTrack(timeline);
  const subtitleTrack = getSubtitleTrack(timeline);
  const characterTrack = getCharacterTrack(timeline);
  
  return (
    <AbsoluteFill className="bg-white">
      {/* Background Layer */}
      <Background showGrid={true} />
      
      {/* Static Title Overlay */}
      {titleText && (
        <div className="absolute top-10 left-10 z-10">
          <div className="text-6xl font-black text-black">{titleText}</div>
        </div>
      )}
      
      {/* Main Content Area */}
      <div className="absolute top-[100px] left-[100px] right-[100px] bottom-[300px] border-4 border-dashed border-gray-400 flex items-center justify-center">
        <h2 className="text-4xl text-gray-500">Main Content / Slide Area</h2>
      </div>
      
      {/* Audio Track */}
      {audioTrack && (
        <AudioTrack track={audioTrack} assets={timeline.assets} />
      )}
      
      {/* Character Track */}
      {characterTrack && (
        <CharacterTrack track={characterTrack} />
      )}
      
      {/* Subtitle Track (rendered last for z-index) */}
      {subtitleTrack && (
        <SubtitleTrack track={subtitleTrack} />
      )}
    </AbsoluteFill>
  );
};

