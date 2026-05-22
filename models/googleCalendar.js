const { google } = require('googleapis');
const { TIMEZONE } = require('../utils/appointmentsConfig');

const getCalendarId = () => process.env.GOOGLE_CALENDAR_ID || 'primary';

const isCalendarConfigured = () => {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

const getAuthClient = () => {
    if(!isCalendarConfigured()) {
        const error = new Error('Faltan credenciales de Google Calendar.');
        error.missingConfig = true;
        throw error;
    }

    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
    );

    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return auth;
}

const getCalendar = () => google.calendar({ version: 'v3', auth: getAuthClient() });

const normalizeCalendarError = (error) => {
    if(error && (error.message === 'invalid_grant' || error.response?.data?.error === 'invalid_grant')) {
        const calendarError = new Error('Google Calendar no pudo autorizarse. Regenera GOOGLE_REFRESH_TOKEN.');
        calendarError.invalidGrant = true;
        throw calendarError;
    }

    throw error;
}

const isAvailable = async (start, end) => {
    const calendar = getCalendar();
    let response;
    try {
        response = await calendar.freebusy.query({
            requestBody: {
                timeMin: start.toISOString(),
                timeMax: end.toISOString(),
                timeZone: TIMEZONE,
                items: [{ id: getCalendarId() }]
            }
        });
    } catch (error) {
        normalizeCalendarError(error);
    }

    const busy = response.data.calendars[getCalendarId()]?.busy || [];
    return busy.length === 0;
}

const createAppointmentEvent = async ({ appointment, start, end }) => {
    const calendar = getCalendar();
    let response;
    try {
        response = await calendar.events.insert({
            calendarId: getCalendarId(),
            requestBody: {
                summary: `Cita Thessa - ${appointment.serviceName}`,
                description: [
                    `Cliente: ${appointment.name}`,
                    `Telefono WhatsApp: ${appointment.phoneNumber}`,
                    `Servicio: ${appointment.serviceName}`,
                    `Personas: ${appointment.people}`,
                    'Estado: pendiente de confirmacion'
                ].join('\n'),
                start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
                end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 120 },
                        { method: 'popup', minutes: 1440 }
                    ]
                }
            }
        });
    } catch (error) {
        normalizeCalendarError(error);
    }

    return response.data;
}

const updateAppointmentEvent = async ({ eventId, appointment, start, end }) => {
    const calendar = getCalendar();
    let response;
    try {
        response = await calendar.events.patch({
            calendarId: getCalendarId(),
            eventId,
            requestBody: {
                summary: `Cita Thessa - ${appointment.serviceName}`,
                description: [
                    `Cliente: ${appointment.name}`,
                    `Telefono WhatsApp: ${appointment.phoneNumber}`,
                    `Servicio: ${appointment.serviceName}`,
                    `Personas: ${appointment.people}`,
                    `Estado: ${appointment.status}`
                ].join('\n'),
                start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
                end: { dateTime: end.toISOString(), timeZone: TIMEZONE }
            }
        });
    } catch (error) {
        normalizeCalendarError(error);
    }

    return response.data;
}

const cancelAppointmentEvent = async (eventId) => {
    const calendar = getCalendar();
    try {
        await calendar.events.delete({ calendarId: getCalendarId(), eventId });
    } catch (error) {
        normalizeCalendarError(error);
    }
}

module.exports = {
    isCalendarConfigured,
    isAvailable,
    createAppointmentEvent,
    updateAppointmentEvent,
    cancelAppointmentEvent
}
