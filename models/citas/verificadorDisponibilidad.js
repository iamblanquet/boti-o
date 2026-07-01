const { isCalendarConfigured, isAvailable } = require('../googleCalendar');
const { listActiveAppointments } = require('./almacenamiento');

const ACTIVE_STATUSES = new Set(['pendiente', 'confirmada']);

const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB;

const isLocallyAvailable = async (start, end, excludeAppointmentId = null, appointments = null) => {
    const activeAppointments = appointments || await listActiveAppointments();

    return !(activeAppointments || []).some((appointment) => {
        if(!ACTIVE_STATUSES.has(appointment.status)) return false;
        if(excludeAppointmentId && appointment.id === excludeAppointmentId) return false;

        const appointmentStart = new Date(appointment.startAt);
        const appointmentEnd = new Date(appointment.endAt);
        if(Number.isNaN(appointmentStart.getTime()) || Number.isNaN(appointmentEnd.getTime())) return false;

        return overlaps(start, end, appointmentStart, appointmentEnd);
    });
}

const checkAvailability = async (start, end, options = {}) => {
    const localAvailable = await isLocallyAvailable(
        start,
        end,
        options.excludeAppointmentId,
        options.appointments
    );
    if(!localAvailable) return { available: false, source: 'local' };

    if(!isCalendarConfigured()) {
        return { available: true, source: 'local', calendarUnavailable: true };
    }

    try {
        return {
            available: await isAvailable(start, end),
            source: 'google'
        };
    } catch (error) {
        console.error('Google Calendar availability fallback:', error.message);
        return {
            available: true,
            source: 'local',
            calendarUnavailable: true,
            calendarError: error
        };
    }
}

module.exports = {
    overlaps,
    isLocallyAvailable,
    checkAvailability
};
