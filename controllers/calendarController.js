const CitasStorage = require('../models/citas/almacenamiento');
const ClientesStorage = require('../models/clientes/almacenamiento');
const {
    isCalendarConfigured,
    listCalendarEvents
} = require('../models/googleCalendar');

const getDescriptionValue = (description, label) => {
    const match = String(description || '').match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
    return match ? match[1].trim() : null;
};

const normalizePhoneNumber = (phoneNumber) => String(phoneNumber || '').replace(/\D/g, '');

const toLocalCalendarEvent = (appointment) => ({
    id: appointment.id,
    eventId: appointment.eventId || null,
    title: `Cita Thessa - ${appointment.serviceName || 'Servicio'}`,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    clientName: appointment.name || null,
    phoneNumber: appointment.phoneNumber || null,
    serviceName: appointment.serviceName || 'Otros',
    people: appointment.people || 1,
    status: appointment.status,
    htmlLink: appointment.eventId
        ? `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(appointment.eventId)}`
        : null,
    source: appointment.source || 'local'
});

const getConfirmedAppointments = async (req, res) => {
    try {
        const activeAppointments = await CitasStorage.listActiveAppointments();
        const confirmed = activeAppointments
            .filter((appointment) => appointment.status === 'confirmada')
            .map(toLocalCalendarEvent);
        const clients = await ClientesStorage.listClients();
        const clientsByPhone = new Map(
            (clients || []).map((client) => [normalizePhoneNumber(client.phoneNumber), client])
        );

        if (!isCalendarConfigured()) {
            return res.json({
                events: confirmed,
                source: 'local',
                connected: false,
                warning: 'Google Calendar no esta configurado. Se muestran las citas confirmadas guardadas por el bot.'
            });
        }

        const start = req.query.start || new Date().toISOString();
        const end = req.query.end || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

        try {
            const googleEvents = await listCalendarEvents({ timeMin: start, timeMax: end });
            const appointmentsByEventId = new Map(
                confirmed
                    .filter((appointment) => appointment.eventId)
                    .map((appointment) => [appointment.eventId, appointment])
            );

            const mergedEvents = googleEvents.map((event) => {
                const appointment = appointmentsByEventId.get(event.eventId);
                const phoneNumber = appointment?.phoneNumber
                    || getDescriptionValue(event.description, 'Telefono WhatsApp');
                const client = clientsByPhone.get(normalizePhoneNumber(phoneNumber));

                const status = appointment?.status || null;

                return {
                    ...event,
                    clientName: client?.name
                        || appointment?.clientName
                        || getDescriptionValue(event.description, 'Cliente'),
                    phoneNumber,
                    serviceName: appointment?.serviceName
                        || getDescriptionValue(event.description, 'Servicio')
                        || (event.title ? event.title.replace(/^Cita Thessa\s*-\s*/i, '') : 'Otros'),
                    people: appointment?.people
                        || getDescriptionValue(event.description, 'Personas')
                        || 1,
                    status
                };
            }).filter((event) => String(event.status || '').trim().toLowerCase() === 'confirmada');

            const googleEventIds = new Set(mergedEvents.map((event) => event.eventId));
            confirmed.forEach((appointment) => {
                if (!appointment.eventId || !googleEventIds.has(appointment.eventId)) {
                    mergedEvents.push(appointment);
                }
            });

            mergedEvents.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

            return res.json({
                events: mergedEvents,
                source: 'google',
                connected: true,
                warning: null
            });
        } catch (calendarError) {
            console.error('Google Calendar list fallback:', calendarError.message);
            return res.json({
                events: confirmed,
                source: 'local',
                connected: false,
                warning: calendarError.message
            });
        }
    } catch (error) {
        console.error('Error al obtener citas confirmadas para el calendario:', error);
        res.status(500).json({ error: 'No se pudieron obtener las citas confirmadas' });
    }
};

module.exports = {
    getConfirmedAppointments
};
