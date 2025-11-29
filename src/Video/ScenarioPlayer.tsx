import React from 'react';
import { Audio, Series, staticFile, useVideoConfig } from 'remotion';

export interface ScenarioItem {
    fileName: string;
    text: string;
    speakerId: number;
    audioSrc: string;
    durationInSeconds: number;
}

interface ScenarioPlayerProps {
    scenario: ScenarioItem[];
    renderContent: (item: ScenarioItem) => React.ReactNode;
}

export const ScenarioPlayer: React.FC<ScenarioPlayerProps> = ({ scenario, renderContent }) => {
    const { fps } = useVideoConfig();

    return (
        <Series>
            {scenario.map((item) => {
                // Add a small pause (buffer) after each clip if desired, e.g. 0.5s
                const bufferSeconds = 0.5;
                const durationInFrames = Math.ceil((item.durationInSeconds + bufferSeconds) * fps);

                return (
                    <Series.Sequence 
                        key={item.fileName} 
                        durationInFrames={durationInFrames}
                        layout="none" // Important to not create extra DOM wrapping div if possible, or handle layout in parent
                    >
                        {/* Audio Playback */}
                        <Audio src={staticFile(item.audioSrc)} />
                        
                        {/* Visual Content Rendering (Text, Character State, etc.) */}
                        {renderContent(item)}
                    </Series.Sequence>
                );
            })}
        </Series>
    );
};

