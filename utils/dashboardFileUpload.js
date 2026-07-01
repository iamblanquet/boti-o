const path = require('path');

const MIME_EXTENSION_MAP = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'audio/aac': '.aac',
    'audio/amr': '.amr',
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/webm': '.webm',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp'
};

const parseDataUrl = (dataUrl) => {
    const value = String(dataUrl || '');
    if (!value.startsWith('data:')) return null;

    const commaIndex = value.indexOf(',');
    if (commaIndex < 0) return null;

    const header = value.slice(5, commaIndex);
    const data = value.slice(commaIndex + 1);
    const parts = header.split(';').filter(Boolean);
    const hasBase64Flag = parts.some((part) => part.toLowerCase() === 'base64');
    if (!hasBase64Flag || !data) return null;

    const mimeType = (parts.find((part) => part.includes('/')) || 'application/octet-stream').toLowerCase();

    return {
        mimeType,
        buffer: Buffer.from(data, 'base64')
    };
};

const resolveUploadExtension = (originalName, mimeType) => {
    const parsedPath = path.parse(String(originalName || 'archivo'));
    const extensionFromName = String(parsedPath.ext || '').toLowerCase();
    if (/^\.[a-z0-9]+$/i.test(extensionFromName)) return extensionFromName;
    return MIME_EXTENSION_MAP[mimeType] || '.bin';
};

const buildSafeUploadFilename = (originalName, mimeType, now = Date.now()) => {
    const parsedPath = path.parse(String(originalName || 'archivo'));
    const safeBaseName = parsedPath.name.replace(/[^a-zA-Z0-9]+/g, '-') || 'archivo';
    const safeExtension = resolveUploadExtension(originalName, mimeType);
    return `${safeBaseName}-${now}${safeExtension}`;
};

const resolveDashboardMessageType = (mimeType, originalName = '') => {
    const extension = path.extname(String(originalName || '')).toLowerCase();
    if (['.aac', '.amr', '.m4a', '.mp3', '.ogg', '.opus', '.wav', '.webm'].includes(extension)) return 'audio';
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) return 'image';
    if (['.mp4', '.3gp'].includes(extension)) return 'video';

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';

    return 'document';
};

module.exports = {
    MAX_DASHBOARD_UPLOAD_BYTES: 16 * 1024 * 1024,
    parseDataUrl,
    buildSafeUploadFilename,
    resolveDashboardMessageType,
    resolveUploadExtension
};
