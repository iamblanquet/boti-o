const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isUpcomingActiveAppointment
} = require('../models/citas/almacenamiento');
const {
    shouldExpirePendingAppointment,
    shouldSendPostAppointmentCare
} = require('../models/citas/recordatorios');

const now = new Date('2026-07-30T12:00:00.000Z');

test('only future pending or confirmed appointments are active', () => {
    assert.equal(isUpcomingActiveAppointment({
        status: 'pendiente',
        endAt: '2026-07-30T13:00:00.000Z'
    }, now), true);
    assert.equal(isUpcomingActiveAppointment({
        status: 'confirmada',
        endAt: '2026-07-30T11:59:59.000Z'
    }, now), false);
    assert.equal(isUpcomingActiveAppointment({
        status: 'cancelada',
        endAt: '2026-07-30T13:00:00.000Z'
    }, now), false);
});

test('a pending appointment expires during the final hour only', () => {
    assert.equal(shouldExpirePendingAppointment({ status: 'pendiente' }, 60 * 60 * 1000), true);
    assert.equal(shouldExpirePendingAppointment({ status: 'pendiente' }, 60 * 60 * 1000 + 1), false);
    assert.equal(shouldExpirePendingAppointment({ status: 'confirmada' }, 30 * 60 * 1000), false);
});

test('post-appointment care is sent once the confirmed appointment has ended', () => {
    const appointment = {
        status: 'confirmada',
        reminders: { postAppointmentCareDueAt: '2026-07-30T12:00:00.000Z' }
    };

    assert.equal(shouldSendPostAppointmentCare(appointment, now), true);
    assert.equal(shouldSendPostAppointmentCare({
        ...appointment,
        reminders: { ...appointment.reminders, postAppointmentCareSentAt: now.toISOString() }
    }, now), false);
});
