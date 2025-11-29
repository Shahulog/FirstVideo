import React from "react";
import { AbsoluteFill } from "remotion";

export const Background: React.FC<{ showGrid?: boolean }> = ({ showGrid }) => {
  return (
    <AbsoluteFill className="bg-[#80ff00]">
      {/* Green background as per user image */}
      
      {showGrid && (
        <div className="w-full h-full absolute top-0 left-0" style={{
            backgroundImage: `linear-gradient(to right, white 1px, transparent 1px),
                              linear-gradient(to bottom, white 1px, transparent 1px)`,
            backgroundSize: '100px 100px',
            opacity: 0.5
        }}>
             {/* Axis labels could go here if needed */}
        </div>
      )}
    </AbsoluteFill>
  );
};

