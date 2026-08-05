const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const MAX_WHATSAPP_IMAGE_BYTES = Math.floor(4.5 * 1024 * 1024);
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

const execFileAsync = (file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
        if(error) {
            error.stderr = stderr;
            reject(error);
            return;
        }
        resolve({ stdout, stderr });
    });
});

const inputExtension = (mimeType) => ({
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
}[mimeType] || '.img');

const normalizeForWhatsappImage = async ({ buffer, mimeType, filename }) => {
    if(!buffer?.length) throw new Error('La imagen está vacía.');
    if(SUPPORTED_MIME_TYPES.has(mimeType) && buffer.length <= MAX_WHATSAPP_IMAGE_BYTES) {
        return { buffer, mimeType, filename };
    }
    if(!ffmpegPath) throw new Error('No se puede comprimir la imagen porque ffmpeg no está disponible.');

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'whatsapp-image-'));
    const inputPath = path.join(tempDir, `input${inputExtension(mimeType)}`);
    const outputPath = path.join(tempDir, 'image.jpg');

    try {
        await fs.writeFile(inputPath, buffer);
        await execFileAsync(ffmpegPath, [
            '-y', '-i', inputPath,
            '-vf', 'scale=1600:1600:force_original_aspect_ratio=decrease',
            '-frames:v', '1', '-q:v', '5', outputPath
        ]);

        const normalized = await fs.readFile(outputPath);
        if(normalized.length > MAX_WHATSAPP_IMAGE_BYTES) {
            throw new Error('La imagen sigue siendo demasiado grande para WhatsApp después de optimizarla.');
        }

        return {
            buffer: normalized,
            mimeType: 'image/jpeg',
            filename: `${path.parse(filename || 'service-image').name || 'service-image'}.jpg`
        };
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

module.exports = { normalizeForWhatsappImage, MAX_WHATSAPP_IMAGE_BYTES };
