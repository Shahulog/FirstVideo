import React, { useMemo } from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

interface CharacterProps {
    isTalking?: boolean; // Controls mouth animation
}

export const Character: React.FC<CharacterProps> = ({ isTalking = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Blink Logic
  // Blink every 3 seconds (approx 90 frames)
  const blinkInterval = 3 * fps;
  const blinkDuration = 5;
  
  const isBlinking = useMemo(() => {
    const cycleFrame = frame % blinkInterval;
    return cycleFrame < blinkDuration;
  }, [frame, blinkInterval]);

  // Mouth Logic
  // Simple oscillation if talking
  const mouthOpenFreq = 6; // Toggle every 6 frames
  const isMouthOpen = isTalking && (frame % mouthOpenFreq < mouthOpenFreq / 2);

  // Base path for assets
  const basePath = "shahulog/立ち絵";

  // Asset Paths
  const bodyImg = `${basePath}/体/モニター肌色.png`;
  const hairImg = `${basePath}/髪/ぼっちゃまヘア.png`;
  
  const eyeImg = isBlinking 
    ? `${basePath}/目/閉じ目.png` 
    : `${basePath}/目/普通目.png`;

  const mouthImg = isMouthOpen
    ? `${basePath}/口/あ00.png`
    : `${basePath}/口/にっ口閉じ.png`;

  return (
    <div className="relative w-full h-full">
      {/* Layers: Body -> Face Parts -> Hair usually (or Hair Back -> Body -> Face -> Hair Front) */}
      {/* Assuming standard single-layer parts where Hair goes on top */}
      
      {/* 1. Body */}
      <Img 
        src={staticFile(bodyImg)} 
        className="absolute top-0 left-0 w-full h-full object-contain" 
      />

      {/* 2. Mouth */}
      <Img 
        src={staticFile(mouthImg)} 
        className="absolute top-0 left-0 w-full h-full object-contain" 
      />

      {/* 3. Eyes */}
      <Img 
        src={staticFile(eyeImg)} 
        className="absolute top-0 left-0 w-full h-full object-contain" 
      />

      {/* 4. Hair */}
      <Img 
        src={staticFile(hairImg)} 
        className="absolute top-0 left-0 w-full h-full object-contain" 
      />
    </div>
  );
};
