import fs from 'fs';
import path from 'path';
import axios from 'axios';

// --- Configuration ---
const VOICEVOX_URL = 'http://127.0.0.1:50021'; // Ensure Voicevox is running
const SCENARIO_FILE = './scripts/scenario.json';
const OUTPUT_DIR = './public/audio';
const MANIFEST_FILE = './src/audio_manifest.json'; // For Remotion to import

// --- Types (implicitly defined for JS) ---
// Item: { fileName: string, text: string, speakerId: number }

async function generateAudio() {
    console.log('🚀 Starting Audio Generation...');

    // 1. Read Scenario
    const scenarioRaw = fs.readFileSync(SCENARIO_FILE, 'utf-8');
    const scenario = JSON.parse(scenarioRaw);

    // 2. Ensure Output Directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const manifest = [];

    // 3. Process Each Line
    for (const item of scenario) {
        const { fileName, text, speakerId } = item;
        const outputFilename = `${fileName}.wav`;
        const outputPath = path.join(OUTPUT_DIR, outputFilename);

        console.log(`🎙️ Generating: ${text.slice(0, 20)}...`);

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
                    responseType: 'arraybuffer' // Important for binary data
                }
            );

            // C. Save File
            fs.writeFileSync(outputPath, synthesisRes.data);
            console.log(`✅ Saved: ${outputPath}`);

            // Add to manifest (path relative to staticFile / public is just the filename)
            manifest.push({
                ...item,
                audioSrc: `audio/${outputFilename}`
            });

        } catch (error) {
            console.error(`❌ Error generating ${fileName}:`, error.message);
            if (error.code === 'ECONNREFUSED') {
                console.error('   Make sure VOICEVOX is running on port 50021!');
                process.exit(1);
            }
        }
    }

    // 4. Write Manifest
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    console.log(`📝 Manifest written to ${MANIFEST_FILE}`);
    console.log('✨ All done!');
}

generateAudio();

