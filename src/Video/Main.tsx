import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { Character } from "./Character";
import { Background } from "./Background";
import { TextOverlay } from "./TextOverlay";
import { ScenarioItem, ScenarioPlayer } from "./ScenarioPlayer";
import audioManifest from "../audio_manifest.json"; // Direct import for now

export const myVideoSchema = z.object({
  titleText: z.string(),
});

export const Main: React.FC<z.infer<typeof myVideoSchema>> = ({
  titleText,
}) => {
  return (
    <AbsoluteFill className="bg-white">
        <Background showGrid={true} />
        
        {/* Static Title Overlay (Always visible) */}
        <div className="absolute top-10 left-10 z-10">
             <div className="text-6xl font-black text-black">{titleText}</div>
        </div>

        {/* Main Content Area (Slide/Image) - Static for now */}
        <div className="absolute top-[100px] left-[100px] right-[100px] bottom-[300px] border-4 border-dashed border-gray-400 flex items-center justify-center">
            <h2 className="text-4xl text-gray-500">Main Content / Slide Area</h2>
        </div>

        {/* Scenario Player: Handles Audio, Subtitles, and Character Lip-sync */}
        <ScenarioPlayer 
            scenario={audioManifest as ScenarioItem[]}
            renderContent={(item) => (
                <>
                    {/* Character Updates based on talking state */}
                    <div className="absolute bottom-[-100px] right-10 w-[400px] h-[500px]">
                        {/* 
                           We pass isTalking=true constantly here because this component 
                           is mounted ONLY during the audio duration of this specific clip.
                        */}
                        <Character isTalking={true} />
                    </div>

                    {/* Subtitle Updates */}
                    
                        <TextOverlay title="" subtitle={item.text} />
                </>
            )}
        />
    </AbsoluteFill>
  );
};
