import React from "react";

export const TextOverlay: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  return (
    <div className="absolute w-full h-full pointer-events-none flex flex-col justify-between p-10">
      {/* Top Left Title */}
      <div className="text-6xl font-black text-black">
        {title}
      </div>

      {/* Bottom Center Subtitle area */}
      <div className="flex flex-col items-center justify-end pb-20 space-y-4">
          <StrokedText text={subtitle} fontSize={80} color="red" strokeColor="white" outerStrokeColor="black" />
      </div>
    </div>
  );
};

const StrokedText: React.FC<{
    text: string; 
    fontSize: number; 
    color: string;
    strokeColor: string;
    outerStrokeColor: string;
}> = ({ text, fontSize, color, strokeColor, outerStrokeColor }) => {
    return (
        <div className="relative" style={{ fontSize, fontFamily: 'sans-serif', fontWeight: 900 }}>
            {/* Outer Stroke (Black) */}
             <span className="absolute top-0 left-0" style={{ 
                WebkitTextStroke: `16px ${outerStrokeColor}`,
             }}>
                {text}
            </span>
            
            {/* Inner Stroke (White) */}
            <span className="absolute top-0 left-0" style={{ 
                WebkitTextStroke: `8px ${strokeColor}`,
             }}>
                {text}
            </span>

            {/* Main Text (Color) */}
            <span className="relative text-red-600">
                {text}
            </span>
        </div>
    );
}

