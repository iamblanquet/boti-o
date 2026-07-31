const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isUpcomingActiveAppointment
} = require('../models/citas/almacenamiento');
const {
    shouldSendOneHourReminder,
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

test('a recently created appointment is kept and does not receive an immediate duplicate reminder', () => {
    const startAt = '2026-07-30T12:30:00.000Z';
    assert.equal(shouldSendOneHourReminder({
        status: 'pendiente',
        startAt,
        createdAt: '2026-07-30T12:00:00.000Z',
        reminders: {}
    }, 30 * 60 * 1000), false);

    assert.equal(shouldSendOneHourReminder({
        status: 'pendiente',
        startAt,
        createdAt: '2026-07-30T10:00:00.000Z',
        reminders: {}
    }, 30 * 60 * 1000), true);
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
