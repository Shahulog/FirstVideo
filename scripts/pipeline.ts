/**
 * Pipeline Script (TypeScript version)
 * 
 * Orchestrates: Script -> Normalize -> Audio Generation -> Timeline Compilation
 * 
 * Uses the unified compile logic from src/compiler/compile.ts
 * Uses Zod validation from spec/script.schema.ts
 * 
 * Usage: npx tsx scripts/pipeline.ts
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

// Import schema and compiler
import { parseScript, type Script, type DialogueBlock } from "../spec/script.schema";
import { compile } from "../src/compiler/compile";
import { parseTimeline } from "../spec/timeline.schema";
import { generateAudioKey, type AudioManifestItem } from "../src/compiler/rules/dialogue";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const SCRIPT_FILE = path.join(__dirname, "script.json");
const SCENARIO_FILE = path.join(__dirname, "scenario.json");

// Output to src/generated for stable imports (SSOT)
const GENERATED_DIR = path.join(__dirname, "..", "src", "generated");
const NORMALIZED_SCRIPT_FILE = path.join(GENERATED_DIR, "script.normalized.json");
const AUDIO_MANIFEST_FILE = path.join(GENERATED_DIR, "audio-manifest.json");
const TIMELINE_FILE = path.join(GENERATED_DIR, "timeline.json");

/**
 * Ensure directory exists
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
}

/**
 * Convert old scenario.json format to Script v0.1
 */
function convertScenarioToScript(scenario: Array<{ text: string; speakerId?: number; fileName?: string }>): Script {
  const speakerId = scenario[0]?.speakerId ?? 3;
  
  return {
    version: "0.1",
    video: {
      fps: 30,
      width: 1920,
      height: 1080,
      defaultPauseSec: 0.5,
    },
    cast: {
      shahulog: {
        voice: {
          engine: "voicevox",
          speakerId,
        },
        assets: {
          baseDir: "shahulog/立ち絵",
        },
      },
    },
    scenes: [{
      id: "main",
      blocks: scenario.map((item, index) => ({
        type: "dialogue" as const,
        speaker: "shahulog",
        text: item.text,
        audioKey: generateAudioKey("main", index),
        fileName: item.fileName,
      })),
    }],
  };
}

/**
 * Normalize script: ensure all dialogue blocks have audioKey
 */
function normalizeScript(script: Script): Script {
  const normalizedScenes = script.scenes.map((scene) => {
    const normalizedBlocks = scene.blocks.map((block, blockIndex) => {
      if (block.type === "dialogue") {
        const dialogueBlock = block as DialogueBlock;
        return {
          ...dialogueBlock,
          audioKey: dialogueBlock.audioKey ?? dialogueBlock.id ?? generateAudioKey(scene.id, blockIndex),
        };
      }
      return block;
    });
    return { ...scene, blocks: normalizedBlocks };
  });
  
  return { ...script, scenes: normalizedScenes };
}

/**
 * Load and validate Script using Zod
 */
function loadScript(): Script {
  // Check if script.json exists, otherwise try to convert scenario.json
  if (!fs.existsSync(SCRIPT_FILE)) {
    console.log("⚠️ script.json not found, converting from scenario.json...");
    
    if (!fs.existsSync(SCENARIO_FILE)) {
      throw new Error("Neither script.json nor scenario.json found");
    }
    
    const scenarioRaw = fs.readFileSync(SCENARIO_FILE, "utf-8");
    const scenario = JSON.parse(scenarioRaw);
    const script = convertScenarioToScript(scenario);
    fs.writeFileSync(SCRIPT_FILE, JSON.stringify(script, null, 2));
    console.log("✅ Converted scenario.json to script.json");
  }
  
  const scriptRaw = fs.readFileSync(SCRIPT_FILE, "utf-8");
  const scriptJson = JSON.parse(scriptRaw);
  
  // Validate with Zod - will throw if invalid
  const script = parseScript(scriptJson);
  
  console.log(`✅ Loaded and validated script v${script.version} with ${script.scenes.length} scenes`);
  return script;
}

/**
 * Save normalized script
 */
function saveNormalizedScript(script: Script): void {
  fs.writeFileSync(NORMALIZED_SCRIPT_FILE, JSON.stringify(script, null, 2));
  console.log(`📝 Normalized script saved to ${NORMALIZED_SCRIPT_FILE}`);
}

/**
 * Check if VOICEVOX is running
 */
async function isVoicevoxRunning(): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:50021/version");
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Run audio generation using generate_audio.mjs
 * Passes normalized script path as argument
 */
async function generateAudio(): Promise<boolean> {
  const voicevoxAvailable = await isVoicevoxRunning();
  
  if (!voicevoxAvailable) {
    console.log("\n⚠️ VOICEVOX is not running. Skipping audio generation.");
    console.log("   Using existing audio manifest if available.");
    return false;
  }
  
  console.log("\n🎙️ Generating audio with VOICEVOX...");
  
  return new Promise((resolve, reject) => {
    // Pass normalized script path as argument
    const genAudio = spawn("node", [
      path.join(__dirname, "generate_audio.mjs"),
      NORMALIZED_SCRIPT_FILE,
    ], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });
    
    genAudio.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Audio generation completed");
        resolve(true);
      } else {
        reject(new Error(`Audio generation failed with code ${code}`));
      }
    });
    
    genAudio.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Load audio manifest from SSOT location
 */
function loadAudioManifest(): AudioManifestItem[] {
  if (!fs.existsSync(AUDIO_MANIFEST_FILE)) {
    console.warn("⚠️ Audio manifest not found at SSOT location, using empty manifest");
    return [];
  }
  
  const manifestRaw = fs.readFileSync(AUDIO_MANIFEST_FILE, "utf-8");
  const manifest: AudioManifestItem[] = JSON.parse(manifestRaw);
  console.log(`✅ Loaded audio manifest with ${manifest.length} items`);
  
  return manifest;
}

/**
 * Save timeline to file
 */
function saveTimeline(timeline: ReturnType<typeof compile>): void {
  const timelineJson = JSON.stringify(timeline, null, 2);
  fs.writeFileSync(TIMELINE_FILE, timelineJson);
  console.log(`📝 Timeline saved to ${TIMELINE_FILE}`);
  
  // Also validate the output to ensure it's correct
  try {
    parseTimeline(timeline);
    console.log("✅ Timeline validated successfully");
  } catch (err) {
    console.error("❌ Timeline validation failed:", err);
    throw err;
  }
}

/**
 * Main pipeline
 */
async function main(): Promise<void> {
  console.log("🚀 Starting pipeline...\n");
  
  try {
    // 1. Ensure generated directory exists
    ensureDir(GENERATED_DIR);
    
    // 2. Load and validate script with Zod
    const script = loadScript();
    
    // 3. Normalize script (ensure all dialogue blocks have audioKey)
    const normalizedScript = normalizeScript(script);
    saveNormalizedScript(normalizedScript);
    
    // 4. Generate audio (if VOICEVOX is available)
    try {
      const audioGenerated = await generateAudio();
      if (!audioGenerated) {
        console.log("   Continuing with existing audio manifest...");
      }
    } catch (err) {
      console.warn(`⚠️ Audio generation failed: ${(err as Error).message}`);
      console.warn("   Continuing with existing audio manifest...");
    }
    
    // 5. Load audio manifest from SSOT
    const audioManifest = loadAudioManifest();
    
    // 6. Compile timeline using the unified compiler
    console.log("\n🔧 Compiling timeline...");
    const timeline = compile(normalizedScript, { audioManifest });
    console.log(`✅ Timeline compiled: ${timeline.meta.totalFrames} frames (${(timeline.meta.totalFrames / timeline.meta.fps).toFixed(2)}s)`);
    
    // 7. Save timeline
    saveTimeline(timeline);
    
    console.log("\n✨ Pipeline completed successfully!");
    console.log(`   Timeline: ${TIMELINE_FILE}`);
    console.log(`   Total duration: ${(timeline.meta.totalFrames / timeline.meta.fps).toFixed(2)}s`);
    
  } catch (err) {
    console.error("\n❌ Pipeline failed:", (err as Error).message);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
