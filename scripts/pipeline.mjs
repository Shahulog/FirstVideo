/**
 * Pipeline Script
 * 
 * Orchestrates: Script -> Audio Generation -> Timeline Compilation
 * 
 * Usage: node scripts/pipeline.mjs
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const SCRIPT_FILE = path.join(__dirname, 'script.json');
const SCENARIO_FILE = path.join(__dirname, 'scenario.json');
const AUDIO_MANIFEST_SRC = path.join(__dirname, '..', 'src', 'audio_manifest.json');
const GENERATED_DIR = path.join(__dirname, '..', 'generated');
const AUDIO_MANIFEST_DEST = path.join(GENERATED_DIR, 'audio-manifest.json');
const TIMELINE_FILE = path.join(GENERATED_DIR, 'timeline.json');

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
}

/**
 * Load and validate Script
 */
async function loadScript() {
  // Dynamically import the schema (compiled TypeScript)
  // Since we're in mjs, we need to handle this carefully
  // For now, we'll do basic validation manually
  
  let scriptPath = SCRIPT_FILE;
  
  // Check if script.json exists, otherwise try to convert scenario.json
  if (!fs.existsSync(SCRIPT_FILE)) {
    console.log('⚠️ script.json not found, converting from scenario.json...');
    
    if (!fs.existsSync(SCENARIO_FILE)) {
      throw new Error('Neither script.json nor scenario.json found');
    }
    
    const scenario = JSON.parse(fs.readFileSync(SCENARIO_FILE, 'utf-8'));
    const script = convertScenarioToScript(scenario);
    fs.writeFileSync(SCRIPT_FILE, JSON.stringify(script, null, 2));
    console.log(`✅ Converted scenario.json to script.json`);
  }
  
  const scriptRaw = fs.readFileSync(SCRIPT_FILE, 'utf-8');
  const script = JSON.parse(scriptRaw);
  
  // Basic validation
  if (script.version !== '0.1') {
    throw new Error(`Unsupported script version: ${script.version}`);
  }
  
  if (!script.video || !script.cast || !script.scenes) {
    throw new Error('Script missing required fields: video, cast, scenes');
  }
  
  console.log(`✅ Loaded script v${script.version} with ${script.scenes.length} scenes`);
  return script;
}

/**
 * Convert old scenario.json format to Script v0.1
 */
function convertScenarioToScript(scenario) {
  // Detect speaker from first item
  const speakerId = scenario[0]?.speakerId ?? 3;
  
  return {
    version: '0.1',
    video: {
      fps: 30,
      width: 1920,
      height: 1080,
      defaultPauseSec: 0.5
    },
    cast: {
      shahulog: {
        voice: {
          engine: 'voicevox',
          speakerId
        }
      }
    },
    scenes: [{
      id: 'main',
      blocks: scenario.map(item => ({
        type: 'dialogue',
        speaker: 'shahulog',
        text: item.text
      }))
    }]
  };
}

/**
 * Check if VOICEVOX is running
 */
async function isVoicevoxRunning() {
  try {
    const response = await fetch('http://127.0.0.1:50021/version');
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Run audio generation using existing generate_audio.mjs
 */
async function generateAudio() {
  // Check if VOICEVOX is running first
  const voicevoxAvailable = await isVoicevoxRunning();
  
  if (!voicevoxAvailable) {
    console.log('\n⚠️ VOICEVOX is not running. Skipping audio generation.');
    console.log('   Using existing audio manifest if available.');
    return false;
  }
  
  console.log('\n🎙️ Generating audio with VOICEVOX...');
  
  return new Promise((resolve, reject) => {
    const genAudio = spawn('node', [path.join(__dirname, 'generate_audio.mjs')], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    
    genAudio.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Audio generation completed');
        resolve(true);
      } else {
        reject(new Error(`Audio generation failed with code ${code}`));
      }
    });
    
    genAudio.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Load audio manifest
 */
function loadAudioManifest() {
  if (!fs.existsSync(AUDIO_MANIFEST_SRC)) {
    console.warn('⚠️ Audio manifest not found, using empty manifest');
    return [];
  }
  
  const manifest = JSON.parse(fs.readFileSync(AUDIO_MANIFEST_SRC, 'utf-8'));
  console.log(`✅ Loaded audio manifest with ${manifest.length} items`);
  
  // Copy to generated directory
  fs.writeFileSync(AUDIO_MANIFEST_DEST, JSON.stringify(manifest, null, 2));
  console.log(`📝 Copied audio manifest to ${AUDIO_MANIFEST_DEST}`);
  
  return manifest;
}

/**
 * Compile Script to Timeline
 */
function compileTimeline(script, audioManifest) {
  console.log('\n🔧 Compiling timeline...');
  
  const { fps, width, height, defaultPauseSec } = script.video;
  
  // Initialize tracks
  const audioTrack = { type: 'audio', clips: [] };
  const subtitleTrack = { type: 'subtitle', clips: [] };
  const characterTrack = { type: 'character', clips: [] };
  const assets = { audio: {} };
  
  let currentFrame = 0;
  let blockIndex = 0;
  
  for (const scene of script.scenes) {
    for (const block of scene.blocks) {
      if (block.type === 'dialogue') {
        // Find matching audio
        const manifestItem = audioManifest.find(m => m.text === block.text) 
          ?? audioManifest[blockIndex];
        
        let durationFrames;
        let audioSrc;
        
        if (manifestItem && manifestItem.durationInSeconds > 0) {
          durationFrames = Math.ceil(manifestItem.durationInSeconds * fps);
          audioSrc = manifestItem.audioSrc;
        } else {
          console.warn(`⚠️ No audio found for block ${blockIndex}: "${block.text.slice(0, 30)}..."`);
          durationFrames = fps * 2;
          audioSrc = `audio/${String(blockIndex + 1).padStart(3, '0')}.wav`;
        }
        
        const pauseSec = block.pauseSec ?? defaultPauseSec;
        const pauseFrames = Math.ceil(pauseSec * fps);
        const totalDuration = durationFrames + pauseFrames;
        
        const assetId = `audio_${String(blockIndex + 1).padStart(3, '0')}`;
        
        // Add asset
        assets.audio[assetId] = {
          src: audioSrc,
          durationFrames
        };
        
        // Add clips
        audioTrack.clips.push({
          assetId,
          start: currentFrame,
          duration: durationFrames
        });
        
        subtitleTrack.clips.push({
          start: currentFrame,
          duration: totalDuration,
          text: block.text
        });
        
        characterTrack.clips.push({
          start: currentFrame,
          duration: totalDuration,
          characterId: block.speaker,
          state: { isTalking: true }
        });
        
        currentFrame += totalDuration;
      }
      
      blockIndex++;
    }
  }
  
  const timeline = {
    version: '0.1',
    meta: {
      fps,
      width,
      height,
      totalFrames: currentFrame
    },
    assets,
    tracks: [audioTrack, subtitleTrack, characterTrack]
  };
  
  console.log(`✅ Timeline compiled: ${currentFrame} frames (${(currentFrame / fps).toFixed(2)}s)`);
  
  return timeline;
}

/**
 * Save timeline to file
 */
function saveTimeline(timeline) {
  fs.writeFileSync(TIMELINE_FILE, JSON.stringify(timeline, null, 2));
  console.log(`📝 Timeline saved to ${TIMELINE_FILE}`);
}

/**
 * Main pipeline
 */
async function main() {
  console.log('🚀 Starting pipeline...\n');
  
  try {
    // 1. Ensure generated directory exists
    ensureDir(GENERATED_DIR);
    
    // 2. Load and validate script
    const script = await loadScript();
    
    // 3. Generate audio (this also updates src/audio_manifest.json)
    // Only runs if VOICEVOX is available
    try {
      const audioGenerated = await generateAudio();
      if (!audioGenerated) {
        console.log('   Continuing with existing audio manifest...');
      }
    } catch (err) {
      console.warn(`⚠️ Audio generation failed: ${err.message}`);
      console.warn('   Continuing with existing audio manifest...');
    }
    
    // 4. Load audio manifest
    const audioManifest = loadAudioManifest();
    
    // 5. Compile timeline
    const timeline = compileTimeline(script, audioManifest);
    
    // 6. Save timeline
    saveTimeline(timeline);
    
    console.log('\n✨ Pipeline completed successfully!');
    console.log(`   Timeline: ${TIMELINE_FILE}`);
    console.log(`   Total duration: ${(timeline.meta.totalFrames / timeline.meta.fps).toFixed(2)}s`);
    
  } catch (err) {
    console.error('\n❌ Pipeline failed:', err.message);
    process.exit(1);
  }
}

main();

