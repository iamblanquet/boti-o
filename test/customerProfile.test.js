const test = require('node:test');
const assert = require('node:assert/strict');
const StateStore = require('../models/stateStore');
const { extractNameFromMessage, getFirstName } = require('../models/customerProfile');

test('extractNameFromMessage accepts explicit introductions', () => {
    assert.equal(extractNameFromMessage('Me llamo Ana López'), 'Ana López');
    assert.equal(extractNameFromMessage('La cita es a nombre de María'), 'María');
});

test('extractNameFromMessage never treats "soy" statements as a name', () => {
    assert.equal(extractNameFromMessage('soy alérgico'), null);
    assert.equal(extractNameFromMessage('soy alergica al látex'), null);
    assert.equal(extractNameFromMessage('soy paciente nuevo'), null);
    assert.equal(extractNameFromMessage('soy Carlos'), null);
});

test('previously saved allergy words are not used as customer names', async () => {
    const phoneNumber = `profile-test-${Date.now()}`;
    await StateStore.set(`${phoneNumber}:profile`, JSON.stringify({ name: 'alergico', nameSource: 'message' }), 60);

    try {
        assert.equal(await getFirstName(phoneNumber), null);
    } finally {
        await StateStore.del(`${phoneNumber}:profile`);
    }
});
