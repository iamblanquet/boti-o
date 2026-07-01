const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const TRANSCODABLE_AUDIO_MIME_TYPES = new Set([
    'audio/webm',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav'
]);

const WHATSAPP_AUDIO_MIME_TYPES = new Set([
    'audio/aac',
    'audio/amr',
    'audio/mp4',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg'
]);

const AUDIO_EXTENSIONS = new Set([
    '.aac',
    '.amr',
    '.m4a',
    '.mp3',
    '.ogg',
    '.opus',
    '.wav',
    '.webm'
]);

const execFileAsync = (file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
            error.stderr = stderr;
            reject(error);
            return;
        }
        resolve({ stdout, stderr });
    });
});

const replaceExtension = (filename, extension) => {
    const parsed = path.parse(String(filename || 'audio-dashboard'));
    return `${parsed.name || 'audio-dashboard'}${extension}`;
};

const transcodeAudioToMp3 = async ({ buffer, name }) => {
    if (!ffmpegPath) {
        throw new Error('ffmpeg no esta disponible para convertir el audio.');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-audio-'));
    const inputPath = path.join(tempDir, name || 'input-audio');
    const outputPath = path.join(tempDir, 'output.mp3');

    try {
        await fs.writeFile(inputPath, buffer);
        await execFileAsync(ffmpegPath, [
            '-y',
            '-i',
            inputPath,
            '-vn',
            '-ac',
            '1',
            '-ar',
            '44100',
            '-c:a',
            'libmp3lame',
            '-b:a',
            '96k',
            outputPath
        ]);

        return {
            buffer: await fs.readFile(outputPath),
            mimeType: 'audio/mpeg',
            name: replaceExtension(name, '.mp3')
        };
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
};

const transcodeAudioToVoiceOgg = async ({ buffer, name }) => {
    if (!ffmpegPath) {
        throw new Error('ffmpeg no esta disponible para convertir el audio.');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-audio-'));
    const inputPath = path.join(tempDir, name || 'input-audio');
    const outputPath = path.join(tempDir, 'output.ogg');

    try {
        await fs.writeFile(inputPath, buffer);
        await execFileAsync(ffmpegPath, [
            '-y',
            '-i',
            inputPath,
            '-vn',
            '-map_metadata',
            '-1',
            '-ac',
            '1',
            '-ar',
            '48000',
            '-c:a',
            'libopus',
            '-b:a',
            '32k',
            '-application',
            'voip',
            '-frame_duration',
            '20',
            outputPath
        ]);

        return {
            buffer: await fs.readFile(outputPath),
            mimeType: 'audio/ogg',
            name: replaceExtension(name, '.ogg'),
            voice: true
        };
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
};

const normalizeDashboardAudioUpload = async ({ buffer, mimeType, name, recorded = false, kind = null }) => {
    const normalizedMimeType = String(mimeType || '').toLowerCase();
    const extension = path.extname(String(name || '')).toLowerCase();
    const isAudioUpload = recorded
        || kind === 'audio'
        || normalizedMimeType.startsWith('audio/')
        || AUDIO_EXTENSIONS.has(extension);

    if (!isAudioUpload) {
        return { buffer, mimeType, name };
    }

    if (recorded) {
        return transcodeAudioToVoiceOgg({ buffer, name });
    }

    if (kind === 'audio' && normalizedMimeType !== 'audio/mpeg' && normalizedMimeType !== 'audio/mp3') {
        return transcodeAudioToVoiceOgg({ buffer, name });
    }

    if (WHATSAPP_AUDIO_MIME_TYPES.has(normalizedMimeType)) {
        return { buffer, mimeType: normalizedMimeType, name };
    }

    if (TRANSCODABLE_AUDIO_MIME_TYPES.has(normalizedMimeType)) {
        return transcodeAudioToMp3({ buffer, name });
    }

    return { buffer, mimeType, name };
};

module.exports = {
    normalizeDashboardAudioUpload,
    transcodeAudioToMp3,
    transcodeAudioToVoiceOgg,
    WHATSAPP_AUDIO_MIME_TYPES
};
