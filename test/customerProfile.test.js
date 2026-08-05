const test = require('node:test');
const assert = require('node:assert/strict');
const { extractNameFromMessage } = require('../models/customerProfile');

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
