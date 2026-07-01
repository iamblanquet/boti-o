const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

const { normalizeDashboardAudioUpload } = require('../utils/dashboardAudioTranscoder');

const createWebmTone = () => new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=1000:duration=0.2',
        '-c:a',
        'libopus',
        '-f',
        'webm',
        'pipe:1'
    ], { encoding: 'buffer', maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
            error.stderr = stderr?.toString?.();
            reject(error);
            return;
        }
        resolve(stdout);
    });
});

const createMp4Tone = async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-audio-test-'));
    const outputPath = path.join(tempDir, 'tone.m4a');

    try {
        await new Promise((resolve, reject) => {
            execFile(ffmpegPath, [
                '-y',
                '-f',
                'lavfi',
                '-i',
                'sine=frequency=1000:duration=0.2',
                '-c:a',
                'aac',
                outputPath
            ], { encoding: 'buffer', maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
                if (error) {
                    error.stderr = stderr?.toString?.();
                    reject(error);
                    return;
                }
                resolve({ stdout, stderr });
            });
        });
        return await fs.readFile(outputPath);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
};

test('normalizeDashboardAudioUpload converts webm recordings to WhatsApp voice ogg', async () => {
    const input = await createWebmTone();
    const result = await normalizeDashboardAudioUpload({
        buffer: input,
        mimeType: 'audio/webm',
        name: 'audio-dashboard.webm',
        recorded: true
    });

    assert.equal(result.mimeType, 'audio/ogg');
    assert.equal(result.name, 'audio-dashboard.ogg');
    assert.equal(result.voice, true);
    assert.ok(result.buffer.length > 0);
    assert.equal(result.buffer.subarray(0, 4).toString('ascii'), 'OggS');
});

test('normalizeDashboardAudioUpload converts recorded mp4 audio to voice ogg', async () => {
    const input = await createMp4Tone();
    const result = await normalizeDashboardAudioUpload({
        buffer: input,
        mimeType: 'audio/mp4',
        name: 'audio-dashboard.m4a',
        recorded: true
    });

    assert.equal(result.mimeType, 'audio/ogg');
    assert.equal(result.name, 'audio-dashboard.ogg');
    assert.equal(result.voice, true);
    assert.ok(result.buffer.length > 0);
    assert.equal(result.buffer.subarray(0, 4).toString('ascii'), 'OggS');
});

test('normalizeDashboardAudioUpload treats m4a files reported as video/mp4 as audio', async () => {
    const input = await createMp4Tone();
    const result = await normalizeDashboardAudioUpload({
        buffer: input,
        mimeType: 'video/mp4',
        name: 'audio-dashboard.m4a',
        kind: 'audio'
    });

    assert.equal(result.mimeType, 'audio/ogg');
    assert.equal(result.name, 'audio-dashboard.ogg');
    assert.equal(result.voice, true);
    assert.ok(result.buffer.length > 0);
    assert.equal(result.buffer.subarray(0, 4).toString('ascii'), 'OggS');
});
