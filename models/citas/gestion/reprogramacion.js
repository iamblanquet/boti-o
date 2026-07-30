const { combineDateTime, addMinutes, isWithinBusinessHours, formatHumanDateTime } = require('../../../utils/dateTime');
const { getBookingDuration } = require('../reglas');
const { checkAvailability } = require('../verificadorDisponibilidad');
const { updateAppointmentEvent } = require('../../googleCalendar');
const { saveAppointment } = require('../almacenamiento');

const validateProposedSlot = async (appointment, date, time) => {
    const durationMinutes = getBookingDuration(appointment);
    const start = combineDateTime(date, time);
    const end = addMinutes(start, durationMinutes);
    if(start < new Date() || !isWithinBusinessHours(start, durationMinutes)) {
        return { valid: false, reason: 'outside-hours' };
    }

    const availability = await checkAvailability(start, end, { excludeAppointmentId: appointment.id });
    if(!availability.available) return { valid: false, reason: 'unavailable' };
    return { valid: true, start, end, durationMinutes, availability };
};

const applyReschedule = async (appointment, date, time) => {
    const slot = await validateProposedSlot(appointment, date, time);
    if(!slot.valid) return slot;

    const updated = {
        ...appointment,
        date,
        time,
        durationMinutes: slot.durationMinutes,
        startAt: slot.start.toISOString(),
        endAt: slot.end.toISOString(),
        // La persona ya confirmo explicitamente el cambio; conserva el estado previo.
        status: appointment.status,
        confirmedAt: appointment.confirmedAt || null,
        source: slot.availability.source === 'google' ? 'google-calendar' : 'local-calendar-fallback'
    };
    let eventId = appointment.eventId || null;
    if(eventId && slot.availability.source === 'google') {
        try {
            const event = await updateAppointmentEvent({ eventId, appointment: updated, start: slot.start, end: slot.end });
            eventId = event.id;
        } catch (error) {
            console.error('No se pudo sincronizar la reprogramacion con Google Calendar:', error.message);
            eventId = null;
            updated.source = 'local-calendar-fallback';
        }
    }

    return { valid: true, appointment: await saveAppointment({ ...updated, eventId }), start: slot.start };
};

module.exports = { validateProposedSlot, applyReschedule, formatHumanDateTime };
