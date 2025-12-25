import React from "react";
import { continueRender, delayRender, staticFile } from "remotion";

// Ensure font is loaded via CSS but we can also use inline style reference to be safe
const fontFamily = "SourceHanSans, sans-serif";

const waitForFont = delayRender();
const font = new FontFace(
  `SourceHanSans`,
  `url(${staticFile("font/SourceHanSans/SourceHanSans-Heavy.otf")}) format('opentype')`
);

font
  .load()
  .then(() => {
    document.fonts.add(font);
    continueRender(waitForFont);
  })
  .catch((err) => console.log("Error loading font", err));

export const TextOverlay: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  return (
    <div className="absolute w-full h-full pointer-events-none flex flex-col justify-between p-10">
      {/* Top Left Title */}
      <div className="text-6xl font-black text-black" style={{ fontFamily }}>
        {title}
      </div>

      {/* Bottom Center Subtitle area */}
      <div className="flex flex-col items-center justify-end pb-20 space-y-4 w-full">
          <div className="px-20 text-center w-full">
             <StrokedText text={subtitle} fontSize={60} color="red" strokeColor="white" outerStrokeColor="black" />
          </div>
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
        <div className="relative inline-block bottom-[-100px] w-[1100px]" style={{ fontSize, fontFamily, fontWeight: 900, lineHeight: 1.2 }}>
            {/* Outer Stroke (Black) */}
             <span className="absolute top-0 left-0 w-full h-full" style={{ 
                WebkitTextStroke: `16px ${outerStrokeColor}`,
             }}>
                {text}
            </span>
            
            {/* Inner Stroke (White) */}
            <span className="absolute top-0 left-0 w-full h-full" style={{ 
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
