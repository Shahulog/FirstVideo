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
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";

// Import schema and compiler
import { parseScript, type Script, type DialogueBlock, type AudioProfile } from "../spec/script.schema";
import { compile } from "../src/compiler/compile";
import { parseTimeline } from "../spec/timeline.schema";
import { generateAudioKey, type AudioManifestItem } from "../src/compiler/rules/dialogue";
import { generateBgmAssetId } from "../src/compiler/presets/bgm";

// ============================================================
// Default Audio Profile Values
// ============================================================

const DEFAULT_AUDIO_PROFILE: Required<AudioProfile> = {
  bgmTargetLufs: -26,
  bgmTargetLra: 11,
  truePeakDb: -1.5,
};

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

// ============================================================
// BGM Duration Detection (via ffprobe)
// ============================================================

const PROJECT_ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");

/**
 * Resolve BGM file path (relative to public/ or absolute)
 */
function resolveBgmFilePath(bgmSrc: string): string {
  if (path.isAbsolute(bgmSrc)) {
    return bgmSrc;
  }
  return path.join(PUBLIC_DIR, bgmSrc);
}

/**
 * Check if ffprobe is available in PATH
 */
function isFFprobeAvailable(): boolean {
  try {
    const result = spawnSync("ffprobe", ["-version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

// Cache ffprobe availability check
let ffprobeAvailable: boolean | null = null;

/**
 * Get media duration in seconds using ffprobe
 * Returns null if ffprobe is not available or file doesn't exist
 */
function getMediaDurationSeconds(filePath: string): number | null {
  // Check ffprobe availability (cached)
  if (ffprobeAvailable === null) {
    ffprobeAvailable = isFFprobeAvailable();
    if (!ffprobeAvailable) {
      console.warn("[bgm] ffprobe not found in PATH; disabling loop for BGM");
      console.warn("      Install ffmpeg and add to PATH for proper BGM looping");
    }
  }
  
  if (!ffprobeAvailable) {
    return null;
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.warn(`[bgm] File not found: ${filePath}; disabling loop`);
    return null;
  }

  try {
    const result = spawnSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], {
      encoding: "utf8",
      timeout: 30000, // 30 second timeout for larger files
      windowsHide: true,
    });

    // Check if ffprobe executed successfully
    if (result.error) {
      const err = result.error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        console.warn("[bgm] ffprobe not found; disabling loop");
      } else if (err.code === "ETIMEDOUT") {
        console.warn("[bgm] ffprobe timed out; disabling loop");
      } else {
        console.warn(`[bgm] ffprobe error: ${err.message}; disabling loop`);
      }
      return null;
    }

    if (result.status !== 0) {
      console.warn(`[bgm] ffprobe failed with code ${result.status}; disabling loop`);
      return null;
    }

    const durationStr = result.stdout.trim();
    const duration = parseFloat(durationStr);

    if (isNaN(duration) || duration <= 0) {
      console.warn(`[bgm] Failed to parse duration: "${durationStr}"; disabling loop`);
      return null;
    }

    return duration;
  } catch (err) {
    console.warn(`[bgm] ffprobe execution failed: ${(err as Error).message}; disabling loop`);
    return null;
  }
}

/**
 * Convert seconds to frames (round up)
 */
function secondsToFrames(sec: number, fps: number): number {
  return Math.max(1, Math.ceil(sec * fps));
}

/**
 * Collect all unique BGM sources from script
 * Returns array of { src, assetId }
 */
function collectBgmSources(script: Script): Array<{ src: string; assetId: string }> {
  const sources: Map<string, string> = new Map(); // src -> assetId
  
  // Video-level BGM
  if (script.video.bgm?.src) {
    const src = script.video.bgm.src;
    sources.set(src, generateBgmAssetId(src));
  }
  
  // Scene-level BGM overrides
  for (const scene of script.scenes) {
    if (scene.style?.bgm?.src) {
      const src = scene.style.bgm.src;
      if (!sources.has(src)) {
        sources.set(src, generateBgmAssetId(src));
      }
    }
  }
  
  return Array.from(sources.entries()).map(([src, assetId]) => ({ src, assetId }));
}

/**
 * Get BGM duration in frames using ffprobe for all BGM sources
 * Returns a map of assetId -> durationFrames
 */
function getBgmDurationFrames(script: Script): Record<string, number> | undefined {
  const bgmSources = collectBgmSources(script);
  
  if (bgmSources.length === 0) {
    return undefined;
  }
  
  const fps = script.video.fps ?? 30;
  const result: Record<string, number> = {};
  let hasAnyDuration = false;
  
  for (const { src, assetId } of bgmSources) {
    const bgmPath = resolveBgmFilePath(src);
    const durationSec = getMediaDurationSeconds(bgmPath);
    
    if (durationSec !== null) {
      const durationFrames = secondsToFrames(durationSec, fps);
      result[assetId] = durationFrames;
      hasAnyDuration = true;
      console.log(`🎵 BGM "${src}": ${durationSec.toFixed(2)}s (${durationFrames} frames)`);
    } else {
      console.warn(`⚠️ Could not get duration for BGM "${src}"`);
    }
  }
  
  return hasAnyDuration ? result : undefined;
}

// ============================================================
// BGM Loudness Analysis (via ffmpeg loudnorm)
// ============================================================

// Cache ffmpeg availability check
let ffmpegAvailable: boolean | null = null;

/**
 * Check if ffmpeg is available in PATH
 */
function isFFmpegAvailable(): boolean {
  if (ffmpegAvailable !== null) {
    return ffmpegAvailable;
  }
  
  try {
    const result = spawnSync("ffmpeg", ["-version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    ffmpegAvailable = result.status === 0;
  } catch {
    ffmpegAvailable = false;
  }
  
  if (!ffmpegAvailable) {
    console.warn("[bgm] ffmpeg not found in PATH; skipping loudness analysis");
  }
  
  return ffmpegAvailable;
}

/**
 * Loudness analysis options
 */
interface LoudnessAnalysisOptions {
  targetI: number;    // Target integrated loudness (LUFS)
  targetLra: number;  // Target loudness range (LU)
  targetTp: number;   // Target true peak (dB)
  startSec?: number;  // Optional: analyze only from this point
  endSec?: number;    // Optional: analyze only up to this point
}

/**
 * Loudness analysis result from ffmpeg loudnorm
 */
interface LoudnormResult {
  input_i: string;        // Input integrated loudness
  input_tp: string;       // Input true peak
  input_lra: string;      // Input loudness range
  input_thresh: string;   // Input threshold
  output_i: string;       // Output (target) integrated loudness
  output_tp: string;      // Output true peak
  output_lra: string;     // Output loudness range
  output_thresh: string;  // Output threshold
  normalization_type: string;
  target_offset: string;  // The gain to apply (dB) - THIS IS WHAT WE NEED
}

/**
 * Analyze BGM loudness and calculate the gain needed to reach target LUFS
 * Uses ffmpeg loudnorm 1-pass analysis
 * 
 * @param filePath - Path to the audio file
 * @param opts - Analysis options (targetI, targetLra, targetTp, optional startSec/endSec)
 * @returns The gain in dB to apply, or null if analysis failed
 */
function analyzeLoudnessGainDb(filePath: string, opts: LoudnessAnalysisOptions): number | null {
  if (!isFFmpegAvailable()) {
    return null;
  }
  
  if (!fs.existsSync(filePath)) {
    console.warn(`[loudness] File not found: ${filePath}`);
    return null;
  }
  
  try {
    // Build ffmpeg arguments
    const args: string[] = [
      "-hide_banner",
      "-nostats",
    ];
    
    // Add time range if specified (for loop region analysis)
    if (opts.startSec !== undefined && opts.startSec > 0) {
      args.push("-ss", opts.startSec.toFixed(3));
    }
    if (opts.endSec !== undefined) {
      args.push("-to", opts.endSec.toFixed(3));
    }
    
    // Input file
    args.push("-i", filePath);
    
    // Loudnorm filter with JSON output
    args.push(
      "-af",
      `loudnorm=I=${opts.targetI}:LRA=${opts.targetLra}:TP=${opts.targetTp}:print_format=json`,
      "-f", "null",
      "-"
    );
    
    const result = spawnSync("ffmpeg", args, {
      encoding: "utf8",
      timeout: 60000, // 60 second timeout for longer files
      windowsHide: true,
    });
    
    if (result.error) {
      const err = result.error as NodeJS.ErrnoException;
      console.warn(`[loudness] ffmpeg error: ${err.message}`);
      return null;
    }
    
    // loudnorm outputs JSON to stderr
    const stderr = result.stderr || "";
    
    // Extract JSON from stderr (it's at the end after [Parsed_loudnorm...] lines)
    const jsonMatch = stderr.match(/\{[\s\S]*"target_offset"[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[loudness] Could not find loudnorm JSON in ffmpeg output");
      return null;
    }
    
    const loudnormJson = JSON.parse(jsonMatch[0]) as LoudnormResult;
    const targetOffset = parseFloat(loudnormJson.target_offset);
    
    if (isNaN(targetOffset)) {
      console.warn(`[loudness] Invalid target_offset: "${loudnormJson.target_offset}"`);
      return null;
    }
    
    // Clamp to reasonable range [-12, +12]
    const clampedGain = Math.max(-12, Math.min(12, targetOffset));
    
    // Log analysis results
    console.log(`📊 Loudness analysis for "${path.basename(filePath)}":`);
    console.log(`   Input: ${loudnormJson.input_i} LUFS, TP: ${loudnormJson.input_tp} dB`);
    console.log(`   Target: ${opts.targetI} LUFS → Gain: ${clampedGain.toFixed(2)} dB`);
    
    return clampedGain;
  } catch (err) {
    console.warn(`[loudness] Analysis failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Get loop region from script for a specific BGM source
 * Returns { startSec, endSec } or undefined if no loop region specified
 */
function getBgmLoopRegion(script: Script, src: string): { startSec: number; endSec: number } | undefined {
  // Check video-level BGM
  if (script.video.bgm?.src === src) {
    const bgm = script.video.bgm;
    if (bgm.loopStartSec !== undefined && bgm.loopEndSec !== undefined) {
      return { startSec: bgm.loopStartSec, endSec: bgm.loopEndSec };
    }
  }
  
  // Check scene-level overrides
  for (const scene of script.scenes) {
    if (scene.style?.bgm?.src === src) {
      const bgm = scene.style.bgm;
      if (bgm.loopStartSec !== undefined && bgm.loopEndSec !== undefined) {
        return { startSec: bgm.loopStartSec, endSec: bgm.loopEndSec };
      }
    }
  }
  
  return undefined;
}

/**
 * Get resolved audio profile with defaults
 */
function getAudioProfile(script: Script): Required<AudioProfile> {
  const profile = script.video.audioProfile;
  return {
    bgmTargetLufs: profile?.bgmTargetLufs ?? DEFAULT_AUDIO_PROFILE.bgmTargetLufs,
    bgmTargetLra: profile?.bgmTargetLra ?? DEFAULT_AUDIO_PROFILE.bgmTargetLra,
    truePeakDb: profile?.truePeakDb ?? DEFAULT_AUDIO_PROFILE.truePeakDb,
  };
}

/**
 * Analyze loudness for all BGM sources and return gain map
 * Returns a map of assetId -> loudnessGainDb
 */
function getBgmLoudnessGainDb(script: Script): Record<string, number> | undefined {
  const bgmSources = collectBgmSources(script);
  
  if (bgmSources.length === 0) {
    return undefined;
  }
  
  if (!isFFmpegAvailable()) {
    return undefined;
  }
  
  const audioProfile = getAudioProfile(script);
  const result: Record<string, number> = {};
  let hasAnyGain = false;
  
  for (const { src, assetId } of bgmSources) {
    const bgmPath = resolveBgmFilePath(src);
    
    // Get loop region for more stable loudness measurement
    const loopRegion = getBgmLoopRegion(script, src);
    
    const gainDb = analyzeLoudnessGainDb(bgmPath, {
      targetI: audioProfile.bgmTargetLufs,
      targetLra: audioProfile.bgmTargetLra,
      targetTp: audioProfile.truePeakDb,
      startSec: loopRegion?.startSec,
      endSec: loopRegion?.endSec,
    });
    
    if (gainDb !== null) {
      result[assetId] = gainDb;
      hasAnyGain = true;
    }
  }
  
  return hasAnyGain ? result : undefined;
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
    
    // 6. Get BGM duration via ffprobe (for proper loop timing)
    const bgmDurationFrames = getBgmDurationFrames(normalizedScript);
    
    // 7. Analyze BGM loudness via ffmpeg loudnorm (for normalization)
    console.log("\n🔊 Analyzing BGM loudness...");
    const bgmLoudnessGainDb = getBgmLoudnessGainDb(normalizedScript);
    
    // 8. Compile timeline using the unified compiler
    console.log("\n🔧 Compiling timeline...");
    const timeline = compile(normalizedScript, { audioManifest, bgmDurationFrames, bgmLoudnessGainDb });
    console.log(`✅ Timeline compiled: ${timeline.meta.totalFrames} frames (${(timeline.meta.totalFrames / timeline.meta.fps).toFixed(2)}s)`);
    
    // 9. Save timeline
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
