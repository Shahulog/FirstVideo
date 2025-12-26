/**
 * Audio Generation Script
 * 
 * Generates audio files using VOICEVOX.
 * Reads normalized script and outputs to src/generated/audio-manifest.json (SSOT).
 * 
 * Usage: node scripts/generate_audio.mjs [path-to-normalized-script]
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const VOICEVOX_URL = 'http://127.0.0.1:50021'; 
const OUTPUT_DIR = './public/audio';

// SSOT: All generated files go to src/generated
const GENERATED_DIR = './src/generated';
const MANIFEST_FILE = path.join(GENERATED_DIR, 'audio-manifest.json');

// Accept normalized script path as argument, fallback to default
const NORMALIZED_SCRIPT_FILE = process.argv[2] || path.join(GENERATED_DIR, 'script.normalized.json');

// Legacy fallback
const LEGACY_SCENARIO_FILE = './scripts/scenario.json';

/**
 * Load normalized script or fallback to legacy scenario
 */
function loadInput() {
    // Try normalized script first
    if (fs.existsSync(NORMALIZED_SCRIPT_FILE)) {
        console.log(`📄 Loading normalized script: ${NORMALIZED_SCRIPT_FILE}`);
        const scriptRaw = fs.readFileSync(NORMALIZED_SCRIPT_FILE, 'utf-8');
        const script = JSON.parse(scriptRaw);
        
        // Flatten scenes to blocks with audioKey
        const items = [];
        for (const scene of script.scenes) {
            for (const block of scene.blocks) {
                if (block.type === 'dialogue') {
                    const speakerId = script.cast[block.speaker]?.voice?.speakerId ?? 3;
                    items.push({
                        audioKey: block.audioKey,
                        speaker: block.speaker,
                        text: block.text,
                        speakerId,
                        fileName: block.fileName,
                    });
                }
            }
        }
        return items;
    }
    
    // Fallback to legacy scenario.json
    if (fs.existsSync(LEGACY_SCENARIO_FILE)) {
        console.log(`⚠️ Using legacy scenario: ${LEGACY_SCENARIO_FILE}`);
        const scenarioRaw = fs.readFileSync(LEGACY_SCENARIO_FILE, 'utf-8');
        const scenario = JSON.parse(scenarioRaw);
        return scenario.map((item, index) => ({
            audioKey: `main:${index}`,
            speaker: 'shahulog',
            text: item.text,
            speakerId: item.speakerId ?? 3,
            fileName: item.fileName,
        }));
    }
    
    throw new Error('No input found: neither normalized script nor legacy scenario exists');
}

async function generateAudio() {
    console.log('🚀 Starting Audio Generation...');

    const items = loadInput();
    console.log(`📝 Found ${items.length} dialogue blocks to process`);

    // Ensure directories exist
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(GENERATED_DIR)) {
        fs.mkdirSync(GENERATED_DIR, { recursive: true });
    }

    const manifest = [];
    let fileIndex = 0;

    for (const item of items) {
        const { audioKey, text, speakerId, fileName: existingFileName } = item;
        
        // Generate filename: use existing or create new
        const fileName = existingFileName || String(fileIndex + 1).padStart(3, '0');
        const outputFilename = `${fileName}.wav`;
        const outputPath = path.join(OUTPUT_DIR, outputFilename);

        console.log(`🎙️ [${audioKey}] Generating: ${text.slice(0, 25)}...`);

        try {
            // A. Audio Query
            const queryRes = await axios.post(
                `${VOICEVOX_URL}/audio_query`,
                null, 
                { params: { text, speaker: speakerId } }
            );
            const queryJson = queryRes.data;

            // B. Synthesis
            const synthesisRes = await axios.post(
                `${VOICEVOX_URL}/synthesis`,
                queryJson,
                {
                    params: { speaker: speakerId },
                    responseType: 'arraybuffer'
                }
            );

            const audioBuffer = synthesisRes.data;

            // C. Save File
            fs.writeFileSync(outputPath, audioBuffer);
            console.log(`✅ Saved: ${outputPath}`);

            // D. Calculate Duration from WAV header
            const sampleRate = audioBuffer.readUInt32LE(24);
            const channels = audioBuffer.readUInt16LE(22);
            const bitsPerSample = audioBuffer.readUInt16LE(34);
            
            const dataSize = audioBuffer.length - 44;
            const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
            const durationInSeconds = dataSize / bytesPerSecond;

            console.log(`   ⏱️ Duration: ${durationInSeconds.toFixed(2)}s`);

            // E. Add to manifest with audioKey (SSOT format)
            manifest.push({
                audioKey,
                speakerId,
                text,
                audioSrc: `audio/${outputFilename}`,
                durationInSeconds,
                fileName,
            });

        } catch (error) {
            console.error(`❌ Error generating [${audioKey}]:`, error.message);
            // Still add to manifest with 0 duration so compile can warn
            manifest.push({
                audioKey,
                speakerId,
                text,
                audioSrc: `audio/${outputFilename}`,
                durationInSeconds: 0,
                fileName,
            });
        }
        
        fileIndex++;
    }

    // Write manifest to SSOT location
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    console.log(`📝 Manifest written to ${MANIFEST_FILE} (SSOT)`);
}

generateAudio();
