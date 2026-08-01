const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { hasValidMetaSignature } = require('../middleware/webhookSecurity');

test('accepts a valid Meta webhook signature', () => {
    const body = Buffer.from('{"object":"whatsapp_business_account"}', 'utf8');
    const secret = 'test-app-secret';
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

    assert.equal(hasValidMetaSignature(body, signature, secret), true);
});

test('rejects altered and incomplete Meta webhook signatures', () => {
    const body = Buffer.from('{"entry":[]}', 'utf8');
    const secret = 'test-app-secret';
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

    assert.equal(hasValidMetaSignature(body, null, secret), false);
    assert.equal(hasValidMetaSignature(body, `${signature.slice(0, -1)}0`, secret), false);
    assert.equal(hasValidMetaSignature(body, signature.replace('sha256=', 'sha1='), secret), false);
});
