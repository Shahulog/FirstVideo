import { AbsoluteFill, Audio, staticFile } from "remotion";
import { z } from "zod";
import { Character } from "./Character";
import { Background } from "./Background";
import { TextOverlay } from "./TextOverlay";

export const myVideoSchema = z.object({
  titleText: z.string(),
  subtitleText: z.string(),
  audioSrc: z.string().optional(), // Path to wav file inside public/ folder
});

export const Main: React.FC<z.infer<typeof myVideoSchema>> = ({
  titleText,
  subtitleText,
  audioSrc,
}) => {
  return (
    <AbsoluteFill className="bg-white">
        <Background showGrid={true} />
        
        {/* Main Content Area (Slide/Image) */}
        <div className="absolute top-[100px] left-[100px] right-[100px] bottom-[300px] border-4 border-dashed border-gray-400 flex items-center justify-center">
            <h2 className="text-4xl text-gray-500">Main Content / Slide Area</h2>
        </div>

        {/* Character */}
        <div className="absolute bottom-0 right-10 w-[400px] h-[500px]">
             <Character isTalking={!!audioSrc} />
        </div>

        {/* Text Overlays */}
        <TextOverlay title={titleText} subtitle={subtitleText} />

        {/* Audio */}
        {audioSrc && <Audio src={staticFile(audioSrc)} />}
    </AbsoluteFill>
  );
};
