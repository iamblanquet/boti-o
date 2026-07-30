const test = require('node:test');
const assert = require('node:assert/strict');
const { hasRescheduleIntent } = require('../models/citas/reglas');

test('reschedule intent recognizes reprogramar, reagendar and changing an appointment', () => {
    assert.equal(hasRescheduleIntent('quiero reprogramar mi cita'), true);
    assert.equal(hasRescheduleIntent('quiero reagendar una de mis citas'), true);
    assert.equal(hasRescheduleIntent('necesito cambiar cita'), true);
    assert.equal(hasRescheduleIntent('quiero conocer sus promociones'), false);
});
