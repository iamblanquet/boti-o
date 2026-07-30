const test = require('node:test');
const assert = require('node:assert/strict');
const { isManagementIntent, isManagementPayload, actionPayload } = require('../models/citas/gestion/controlador');
const { createFlow, STEPS, isManagementFlow } = require('../models/citas/gestion/estado');

const id = '4f26ed6c-f27f-4bcc-9b13-4c1ed188a4f4';

test('management intents cover appointment administration phrases', () => {
    assert.equal(isManagementIntent('quiero gestionar mis citas'), true);
    assert.equal(isManagementIntent('necesito reagendar una cita'), true);
    assert.equal(isManagementIntent('quiero cambiar mi cita'), true);
    assert.equal(isManagementIntent('quiero conocer promociones'), false);
});

test('management payloads retain the selected appointment id', () => {
    assert.deepEqual(actionPayload(`appt_manage_reschedule_yes_${id}`), { action: 'reschedule_yes', appointmentId: id });
    assert.equal(isManagementPayload(`appt_manage_keep_${id}`), true);
    const flow = createFlow(STEPS.CONFIRM_RESCHEDULE, { appointmentId: id });
    assert.equal(isManagementFlow(flow), true);
    assert.equal(flow.data.appointmentId, id);
});
