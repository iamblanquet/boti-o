const { google } = require('googleapis');
const { TIMEZONE } = require('../utils/configCitas');
const fs = require('fs');

const getCalendarId = () => process.env.GOOGLE_CALENDAR_ID || 'primary';

const getServiceAccountCreds = () => {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try {
            return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        } catch (e) {
            console.error('Error al parsear GOOGLE_SERVICE_ACCOUNT_JSON:', e.message);
        }
    }
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
        try {
            const fileContent = fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8');
            return JSON.parse(fileContent);
        } catch (e) {
            console.error('Error al leer GOOGLE_SERVICE_ACCOUNT_KEY_PATH:', e.message);
        }
    }
    return null;
};

const isCalendarConfigured = () => {
    return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
}

const getAuthClient = () => {
    if(!isCalendarConfigured()) {
        const error = new Error('Faltan credenciales de Google Calendar.');
        error.missingConfig = true;
        throw error;
    }

    const serviceCreds = getServiceAccountCreds();
    if (serviceCreds) {
        return new google.auth.JWT({
            email: serviceCreds.client_email,
            key: serviceCreds.private_key,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });
    }

    const error = new Error('Faltan credenciales de Google Service Account.');
    error.missingConfig = true;
    throw error;
}

const getCalendar = () => google.calendar({ version: 'v3', auth: getAuthClient() });

const normalizeCalendarError = (error) => {
    if(error && (error.message === 'invalid_grant' || error.response?.data?.error === 'invalid_grant')) {
        const calendarError = new Error('Google Calendar no pudo autorizarse. Verifica las credenciales de la Cuenta de Servicio.');
        calendarError.invalidGrant = true;
        throw calendarError;
    }

    throw error;
}

const isMissingCalendarEventError = (error) => {
    const status = error?.code || error?.response?.status;
    return status === 404 || status === 410;
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
        if(isMissingCalendarEventError(error)) return;
        normalizeCalendarError(error);
    }
}

const listCalendarEvents = async ({ timeMin, timeMax } = {}) => {
    const calendar = getCalendar();
    let response;

    try {
        response = await calendar.events.list({
            calendarId: getCalendarId(),
            timeMin: (timeMin ? new Date(timeMin) : new Date()).toISOString(),
            timeMax: timeMax ? new Date(timeMax).toISOString() : undefined,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 2500,
            timeZone: TIMEZONE
        });
    } catch (error) {
        normalizeCalendarError(error);
    }

    return (response.data.items || [])
        .filter((event) => event.status !== 'cancelled' && event.start?.dateTime)
        .map((event) => ({
            id: event.id,
            eventId: event.id,
            title: event.summary || 'Evento de Google Calendar',
            description: event.description || '',
            startAt: event.start.dateTime,
            endAt: event.end?.dateTime || event.start.dateTime,
            htmlLink: event.htmlLink || null,
            location: event.location || null,
            source: 'google-calendar'
        }));
}

module.exports = {
    isCalendarConfigured,
    isAvailable,
    createAppointmentEvent,
    updateAppointmentEvent,
    cancelAppointmentEvent,
    listCalendarEvents
}
