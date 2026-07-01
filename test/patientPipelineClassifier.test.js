const test = require('node:test');
const assert = require('node:assert/strict');

const { getAutomaticStage } = require('../models/patientPipeline/classifier');
const { STAGES } = require('../models/patientPipeline/stages');

const NOW = new Date('2026-06-26T18:00:00.000Z');

test('patient pipeline starts as lead when chat has no outgoing reply', () => {
    const stage = getAutomaticStage({
        conversation: { incomingCount: 1, outgoingCount: 0, lastDirection: 'in' },
        appointments: [],
        now: NOW
    });

    assert.equal(stage, STAGES.LEAD);
});

test('patient pipeline marks contacted after an outgoing reply', () => {
    const stage = getAutomaticStage({
        conversation: { incomingCount: 1, outgoingCount: 1, lastDirection: 'out' },
        appointments: [],
        now: NOW
    });

    assert.equal(stage, STAGES.CONTACTED);
});

test('patient pipeline marks future confirmed appointment as scheduled', () => {
    const stage = getAutomaticStage({
        conversation: { outgoingCount: 0 },
        appointments: [{
            status: 'confirmada',
            startAt: '2026-06-27T18:00:00.000Z',
            endAt: '2026-06-27T19:00:00.000Z'
        }],
        now: NOW
    });

    assert.equal(stage, STAGES.APPOINTMENT_SCHEDULED);
});

test('patient pipeline marks current confirmed appointment as treatment in progress', () => {
    const stage = getAutomaticStage({
        conversation: { outgoingCount: 0 },
        appointments: [{
            status: 'confirmada',
            startAt: '2026-06-26T17:30:00.000Z',
            endAt: '2026-06-26T18:30:00.000Z'
        }],
        now: NOW
    });

    assert.equal(stage, STAGES.TREATMENT_IN_PROGRESS);
});

test('patient pipeline marks completed confirmed appointment as follow up', () => {
    const stage = getAutomaticStage({
        conversation: { outgoingCount: 1 },
        appointments: [{
            status: 'confirmada',
            startAt: '2026-06-25T17:00:00.000Z',
            endAt: '2026-06-25T18:00:00.000Z'
        }],
        now: NOW
    });

    assert.equal(stage, STAGES.FOLLOW_UP);
});

test('patient pipeline prefers a future appointment over older completed appointments', () => {
    const stage = getAutomaticStage({
        conversation: { outgoingCount: 1 },
        appointments: [
            {
                status: 'confirmada',
                startAt: '2026-06-20T17:00:00.000Z',
                endAt: '2026-06-20T18:00:00.000Z'
            },
            {
                status: 'confirmada',
                startAt: '2026-06-28T17:00:00.000Z',
                endAt: '2026-06-28T18:00:00.000Z'
            }
        ],
        now: NOW
    });

    assert.equal(stage, STAGES.APPOINTMENT_SCHEDULED);
});
