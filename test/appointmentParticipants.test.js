const test = require('node:test');
const assert = require('node:assert/strict');

const { nextMissingField } = require('../models/citas/reglas');
const { parseParticipantNames, formatParticipantNames } = require('../models/citas/participantes');

test('two-person appointments require and format both participant names', () => {
    const data = {
        serviceId: 'masaje',
        date: '2026-08-01',
        time: '10:00',
        people: 2
    };

    assert.equal(nextMissingField(data), 'participantNames');
    assert.equal(parseParticipantNames('Ana López, Beatriz Pérez')?.length, 2);
    assert.equal(parseParticipantNames('Ana López y Beatriz Pérez'), null);

    data.participantNames = ['Ana López', 'Beatriz Pérez'];
    data.name = formatParticipantNames(data.participantNames);
    assert.equal(data.name, 'Ana López y Beatriz Pérez');
    assert.equal(nextMissingField(data), null);
});
