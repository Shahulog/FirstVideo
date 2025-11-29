import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getAudioDurationInSeconds } from '@remotion/media-utils'; // Note: This usually runs in browser, but we might need a node alternative or just use file size approximation if node libs are tricky. 
// Actually for Node script, let's use 'music-metadata' or similar if we want precision, or just rely on remotion's runtime duration calculation.
// BUT, to layout items sequentially in Remotion without "CalculateMetadata", we need to know durations beforehand OR use a Series component.
// Using <Series> is the easiest way in Remotion to play things sequentially!
// However, passing durations to the manifest is still very helpful.

// For this script, let's just get the files. We will let Remotion calculate durations at runtime using getAudioDurationInSeconds or use <Series> which handles sequencing automatically?
// <Series> needs to know the duration of each child to offset the next one properly? No, Series automatically stacks them.
// But <Series.Sequence> requires a duration.
// So we DO need to know the duration of each WAV file.

// Let's use a simple wav header parser or just fetch duration via another way. 
// Since we are in a node script, we can't use @remotion/media-utils easily without window.
// We will use 'wav-decoder' or similar, or just simple file size calculation for approximation?
// PCM 16bit 24kHz mono: 
// bytes = rate * channels * bits/8 * seconds
// seconds = bytes / (rate * channels * bits/8)
// Voicevox default: 24000 Hz, Mono, 16bit? Or 48000? usually 24k.

const VOICEVOX_URL = 'http://127.0.0.1:50021'; 
const SCENARIO_FILE = './scripts/scenario.json';
const OUTPUT_DIR = './public/audio';
const MANIFEST_FILE = './src/audio_manifest.json';

async function generateAudio() {
    console.log('🚀 Starting Audio Generation...');

    const scenarioRaw = fs.readFileSync(SCENARIO_FILE, 'utf-8');
    const scenario = JSON.parse(scenarioRaw);

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const manifest = [];

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
                    responseType: 'arraybuffer'
                }
            );

            const audioBuffer = synthesisRes.data;

            // C. Save File
            fs.writeFileSync(outputPath, audioBuffer);
            console.log(`✅ Saved: ${outputPath}`);

            // D. Estimate Duration (WAV PCM calculation)
            // WAV header is 44 bytes usually. 
            // Voicevox: 24000Hz, 1ch, 16bit (2 bytes) -> 48000 bytes/sec
            // Let's double check if we can parse header from buffer, but estimation is usually fine for 24khz.
            // Actually, queryJson often has 'speedScale' etc, but not duration.
            
            // Let's try to read the sample rate from the buffer (bytes 24-27) to be safe
            const sampleRate = audioBuffer.readUInt32LE(24);
            const channels = audioBuffer.readUInt16LE(22);
            const bitsPerSample = audioBuffer.readUInt16LE(34);
            
            const dataSize = audioBuffer.length - 44; // Approximate if simple wav
            const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
            const durationInSeconds = dataSize / bytesPerSecond;

            console.log(`   ⏱️ Duration: ${durationInSeconds.toFixed(2)}s`);

            manifest.push({
                ...item,
                audioSrc: `audio/${outputFilename}`,
                durationInSeconds: durationInSeconds
            });

        } catch (error) {
            console.error(`❌ Error generating ${fileName}:`, error.message);
        }
    }

    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    console.log(`📝 Manifest written to ${MANIFEST_FILE}`);
}

generateAudio();
