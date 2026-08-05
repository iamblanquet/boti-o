const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeForWhatsappImage } = require('../utils/whatsappImageNormalizer');

test('small JPEG images are sent without recompression', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const result = await normalizeForWhatsappImage({
        buffer,
        mimeType: 'image/jpeg',
        filename: 'service.jpg'
    });

    assert.equal(result.buffer, buffer);
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.filename, 'service.jpg');
});
