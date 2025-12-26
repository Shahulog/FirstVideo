/**
 * Character Component
 * 
 * Renders a character with lip-sync animation.
 * Supports multiple characters via characterId.
 */
import React, { useMemo } from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// Character configurations
const CHARACTER_CONFIGS: Record<string, { baseDir: string }> = {
  shahulog: { baseDir: "shahulog/立ち絵" },
  // Add more characters here as needed
};

const DEFAULT_CONFIG = { baseDir: "shahulog/立ち絵" };

interface CharacterProps {
  characterId?: string;
  isTalking?: boolean;
}

export const Character: React.FC<CharacterProps> = ({ 
  characterId = "shahulog",
  isTalking = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Get character configuration
  const config = CHARACTER_CONFIGS[characterId] ?? DEFAULT_CONFIG;
  const basePath = config.baseDir;

  // Log characterId for debugging (only in development)
  useMemo(() => {
    if (characterId !== "shahulog") {
      console.log(`[Character] Rendering characterId="${characterId}" with basePath="${basePath}"`);
    }
  }, [characterId, basePath]);

  // Blink Logic - blink every 3 seconds
  const blinkInterval = 3 * fps;
  const blinkDuration = 5;
  
  const isBlinking = useMemo(() => {
    const cycleFrame = frame % blinkInterval;
    return cycleFrame < blinkDuration;
  }, [frame, blinkInterval]);

  // Mouth Logic - simple oscillation if talking
  const mouthOpenFreq = 6;
  const isMouthOpen = isTalking && (frame % mouthOpenFreq < mouthOpenFreq / 2);

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
      {/* Layers: Body -> Face Parts -> Hair */}
      
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
