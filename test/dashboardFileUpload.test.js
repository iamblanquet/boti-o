const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseDataUrl,
    buildSafeUploadFilename,
    resolveDashboardMessageType,
    resolveUploadExtension
} = require('../utils/dashboardFileUpload');

test('parseDataUrl accepts audio data URLs with codec parameters', () => {
    const parsed = parseDataUrl('data:audio/ogg;codecs=opus;base64,aG9sYQ==');

    assert.equal(parsed.mimeType, 'audio/ogg');
    assert.equal(parsed.buffer.toString('utf8'), 'hola');
});

test('parseDataUrl accepts empty mime data URLs from strict browsers', () => {
    const parsed = parseDataUrl('data:;base64,aG9sYQ==');

    assert.equal(parsed.mimeType, 'application/octet-stream');
    assert.equal(parsed.buffer.toString('utf8'), 'hola');
});

test('resolveDashboardMessageType detects audio uploads', () => {
    assert.equal(resolveDashboardMessageType('audio/mpeg'), 'audio');
    assert.equal(resolveDashboardMessageType('application/octet-stream', 'audio-dashboard.webm'), 'audio');
    assert.equal(resolveDashboardMessageType('video/mp4', 'audio-dashboard.m4a'), 'audio');
    assert.equal(resolveDashboardMessageType('image/png'), 'image');
    assert.equal(resolveDashboardMessageType('application/pdf'), 'document');
});

test('buildSafeUploadFilename keeps known audio extensions', () => {
    const filename = buildSafeUploadFilename('nota de voz', 'audio/ogg', 123);

    assert.equal(filename, 'nota-de-voz-123.ogg');
});

test('resolveUploadExtension preserves safe original audio extension', () => {
    assert.equal(resolveUploadExtension('mensaje.mp3', 'audio/mpeg'), '.mp3');
    assert.equal(resolveUploadExtension('mensaje', 'audio/mp4'), '.m4a');
});
