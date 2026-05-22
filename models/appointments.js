const { BUSINESS_HOURS, findService, getServiceById, listServices, normalizeText } = require('../utils/appointmentsConfig');
const {
    parseDateText,
    parseTimeText,
    parsePeopleText,
    combineDateTime,
    addMinutes,
    isWithinBusinessHours,
    formatHumanDateTime,
    formatTime
} = require('../utils/dateTime');
const {
    isCalendarConfigured,
    isAvailable,
    createAppointmentEvent,
    updateAppointmentEvent,
    cancelAppointmentEvent
} = require('./googleCalendar');
const {
    getFlow,
    saveFlow,
    clearFlow,
    saveAppointment,
    getLatestActiveAppointment
} = require('./appointmentsStore');
const Messages = require('./messages');
const { extractAppointmentDetails } = require('./appointmentExtractor');

const sendTextMessage = (phoneNumber, message) => Messages.sendTextMessage(message, phoneNumber);

const hasAppointmentIntent = (message) => {
    const value = normalizeText(message);
    return [
        'agendar', 'agendar cita', 'agenda una cita', 'quiero agendar',
        'cita', 'reservar', 'reservar cita', 'hacer cita', 'programar',
        'quiero ir', 'puedo ir', 'pueden atender', 'disponibilidad para'
    ].some((keyword) => value.includes(keyword));
}

const hasRescheduleIntent = (message) => {
    const value = normalizeText(message);
    return ['reprogramar', 'cambiar mi cita', 'mover mi cita', 'cambiar la cita'].some((keyword) => value.includes(keyword));
}

const hasCancelIntent = (message) => {
    const value = normalizeText(message);
    return ['cancelar cita', 'cancela mi cita', 'cancelar mi cita'].some((keyword) => value.includes(keyword));
}

const hasConfirmIntent = (message) => {
    const value = normalizeText(message);
    return ['confirmo', 'confirmar cita', 'si confirmo', 'confirmada'].some((keyword) => value.includes(keyword));
}

const isAffirmative = (message) => ['si', 'confirmo', 'correcto', 'ok', 'vale'].includes(normalizeText(message));
const isNegative = (message) => ['no', 'cancelar', 'mejor no'].includes(normalizeText(message));

const extractAppointmentData = (message) => {
    const service = findService(message);
    return {
        serviceId: service?.id,
        serviceName: service?.name,
        durationMinutes: service?.durationMinutes,
        date: parseDateText(message),
        time: parseTimeText(message),
        people: parsePeopleText(message)
    };
}

const looksLikeAppointmentRequest = (message) => {
    const data = extractAppointmentData(message);
    return Boolean(data.serviceId && (data.date || data.time));
}

const mergeDefinedData = (currentData, extractedData) => {
    const merged = { ...currentData };
    Object.entries(extractedData || {}).forEach(([key, value]) => {
        if(value !== null && value !== undefined && value !== '') merged[key] = value;
    });

    if(merged.serviceId && !merged.durationMinutes) {
        const service = getServiceById(merged.serviceId);
        if(service) {
            merged.serviceName = service.name;
            merged.durationMinutes = service.durationMinutes;
        }
    }

    return merged;
}

const nextMissingField = (data) => {
    if(!data.name) return 'name';
    if(!data.serviceId) return 'service';
    if(!data.people) return 'people';
    if(!data.date) return 'date';
    if(!data.time) return 'time';
    return null;
}

const askForField = async (phoneNumber, field) => {
    const messages = {
        name: 'Con gusto. ¿A nombre de quien agendamos la cita?',
        service: `Con gusto te comparto las opciones: ${listServices()}. ¿Que servicio te gustaria agendar?`,
        people: '¿Para cuantas personas seria la cita?',
        date: '¿Que dia te gustaria agendar? Puedes escribir "manana" o una fecha como "25/05".',
        time: '¿A que hora te gustaria agendar? Por ejemplo: 11:00 am o 5:30 pm.'
    };

    await sendTextMessage(phoneNumber, messages[field]);
}

const findAlternativeSlots = async (data, limit = 3) => {
    const service = getServiceById(data.serviceId);
    if(!service || !data.date) return [];

    const requestedStart = data.time ? combineDateTime(data.date, data.time) : null;
    const day = requestedStart ? requestedStart.getDay() : combineDateTime(data.date, '12:00').getDay();
    const hours = BUSINESS_HOURS[day];
    if(!hours) return [];

    const slots = [];
    let current = combineDateTime(data.date, hours.start);
    const businessEnd = combineDateTime(data.date, hours.end);
    const now = new Date();

    while(addMinutes(current, service.durationMinutes) <= businessEnd && slots.length < limit) {
        const end = addMinutes(current, service.durationMinutes);
        const isSameRequestedTime = requestedStart && current.getTime() === requestedStart.getTime();

        if(current > now && !isSameRequestedTime && isWithinBusinessHours(current, service.durationMinutes)) {
            try {
                const available = await isAvailable(current, end);
                if(available) {
                    slots.push({ date: data.date, time: formatTime(current), label: formatHumanDateTime(current) });
                }
            } catch (error) {
                console.error('Alternative slots error:', error.message);
                return [];
            }
        }

        current = addMinutes(current, 30);
    }

    return slots;
}

const formatAlternativeSlots = (slots) => {
    if(!slots.length) return '';
    return ` Tengo estos horarios disponibles:\n${slots.map((slot) => `- ${slot.label}`).join('\n')}\nPuedes responderme con el horario que prefieras.`;
}

const mergeDataFromMessage = async (flow, message) => {
    const extractedByAi = await extractAppointmentDetails({ message, currentData: flow.data, waitingFor: flow.waitingFor });
    let data = mergeDefinedData(flow.data, extractedByAi);

    if(flow.waitingFor === 'name' && !extractedByAi.name) data.name = message.trim();
    if(flow.waitingFor === 'people' && !extractedByAi.people) data.people = parsePeopleText(message, true);
    if(flow.waitingFor === 'date' && !extractedByAi.date) data.date = parseDateText(message);
    if(flow.waitingFor === 'time' && !extractedByAi.time) data.time = parseTimeText(message);

    const manual = extractAppointmentData(message);
    data = mergeDefinedData(data, manual);

    return data;
}

const createOrReschedule = async ({ phoneNumber, flow }) => {
    const data = flow.data;
    const start = combineDateTime(data.date, data.time);
    const end = addMinutes(start, data.durationMinutes);

    if(!isCalendarConfigured()) {
        await saveAppointment({
            ...data,
            phoneNumber,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            status: 'pendiente',
            calendarPending: true
        });
        await clearFlow(phoneNumber);
        await sendTextMessage(phoneNumber, `Listo, ya tenemos los datos de tu cita para ${data.serviceName} el ${formatHumanDateTime(start)} a nombre de ${data.name}. Falta conectar Google Calendar para guardarla automaticamente, pero con gusto el equipo puede confirmarla con esta informacion.`);
        return true;
    }

    if(start < new Date()) {
        await sendTextMessage(phoneNumber, 'Ese horario ya paso. ¿Me compartes otro dia y hora para revisarlo?');
        flow.waitingFor = 'date';
        await saveFlow(phoneNumber, flow);
        return true;
    }

    if(!isWithinBusinessHours(start, data.durationMinutes)) {
        const alternatives = await findAlternativeSlots(data);
        await sendTextMessage(phoneNumber, `Ese horario queda fuera de atencion.${formatAlternativeSlots(alternatives) || ' ¿Me compartes otro horario dentro de nuestro horario disponible?'}`);
        flow.waitingFor = 'time';
        await saveFlow(phoneNumber, flow);
        return true;
    }

    let available;
    try {
        available = await isAvailable(start, end);
    } catch (error) {
        console.error('Google Calendar availability error:', error.message);
        await sendTextMessage(phoneNumber, 'Ya tengo tus datos, pero no pude revisar disponibilidad en este momento. ¿Me das unos minutos para intentarlo de nuevo?');
        return true;
    }

    if(!available) {
        const alternatives = await findAlternativeSlots(data);
        await sendTextMessage(phoneNumber, `Ese horario ya esta reservado.${formatAlternativeSlots(alternatives) || ' ¿Me compartes otra hora para revisar disponibilidad?'}`);
        flow.waitingFor = 'time';
        await saveFlow(phoneNumber, flow);
        return true;
    }

    const appointment = {
        ...data,
        phoneNumber,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status: 'pendiente'
    };

    if(flow.mode === 'reschedule' && flow.appointmentId) {
        const previous = await getLatestActiveAppointment(phoneNumber);
        const updated = { ...previous, ...appointment, id: flow.appointmentId, status: 'pendiente' };
        const event = await updateAppointmentEvent({ eventId: previous.eventId, appointment: updated, start, end });
        await saveAppointment({ ...updated, eventId: event.id });
        await clearFlow(phoneNumber);
        await sendTextMessage(phoneNumber, `Listo, reprogramamos tu cita para ${formatHumanDateTime(start)}. ¿Me confirmas tu asistencia respondiendo "confirmo"?`);
        return true;
    }

    const event = await createAppointmentEvent({ appointment, start, end });
    await saveAppointment({ ...appointment, eventId: event.id });
    await clearFlow(phoneNumber);
    await sendTextMessage(phoneNumber, `Listo, apartamos tu cita de ${data.serviceName} para ${formatHumanDateTime(start)} a nombre de ${data.name}. ¿Me confirmas tu asistencia respondiendo "confirmo"?`);
    return true;
}

const startAppointmentFlow = async (phoneNumber, message, mode = 'create') => {
    const extractedByAi = await extractAppointmentDetails({ message });
    let data = mergeDefinedData(extractAppointmentData(message), extractedByAi);
    const flow = { mode, data, waitingFor: null };

    if(mode === 'reschedule') {
        const appointment = await getLatestActiveAppointment(phoneNumber);
        if(!appointment) {
            await sendTextMessage(phoneNumber, 'No encontre una cita activa para reprogramar. Si quieres, con gusto podemos agendar una nueva.');
            return true;
        }

        flow.appointmentId = appointment.id;
        flow.data = {
            name: appointment.name,
            serviceId: appointment.serviceId,
            serviceName: appointment.serviceName,
            durationMinutes: appointment.durationMinutes,
            people: appointment.people,
            date: data.date,
            time: data.time
        };
    }

    const missing = nextMissingField(flow.data);
    if(missing) {
        flow.waitingFor = missing;
        await saveFlow(phoneNumber, flow);
        await askForField(phoneNumber, missing);
        return true;
    }

    return createOrReschedule({ phoneNumber, flow });
}

const continueAppointmentFlow = async (phoneNumber, message, flow) => {
    if(flow.mode === 'confirm-cancel') {
        const appointment = await getLatestActiveAppointment(phoneNumber);
        await clearFlow(phoneNumber);

        if(!appointment) {
            await sendTextMessage(phoneNumber, 'No encontre una cita activa para cancelar. Si quieres, lo revisamos con el equipo.');
            return true;
        }

        if(isAffirmative(message)) {
            if(appointment.eventId) await cancelAppointmentEvent(appointment.eventId);
            await saveAppointment({ ...appointment, status: 'cancelada' });
            await sendTextMessage(phoneNumber, 'Listo, cancelamos tu cita. Cuando gustes, con gusto podemos ayudarte a agendar una nueva.');
            return true;
        }

        await sendTextMessage(phoneNumber, 'Perfecto, dejamos tu cita como estaba.');
        return true;
    }

    flow.data = await mergeDataFromMessage(flow, message);
    const missing = nextMissingField(flow.data);
    if(missing) {
        flow.waitingFor = missing;
        await saveFlow(phoneNumber, flow);
        await askForField(phoneNumber, missing);
        return true;
    }

    return createOrReschedule({ phoneNumber, flow });
}

const confirmLatestAppointment = async (phoneNumber) => {
    const appointment = await getLatestActiveAppointment(phoneNumber);
    if(!appointment) {
        await sendTextMessage(phoneNumber, 'No encontre una cita activa para confirmar. Si quieres, revisamos los datos con el equipo.');
        return true;
    }

    await saveAppointment({ ...appointment, status: 'confirmada', confirmedAt: new Date().toISOString() });
    await sendTextMessage(phoneNumber, `Gracias, tu cita queda confirmada para ${formatHumanDateTime(appointment.startAt)}. Te esperamos con gusto.`);
    return true;
}

const startCancelFlow = async (phoneNumber) => {
    const appointment = await getLatestActiveAppointment(phoneNumber);
    if(!appointment) {
        await sendTextMessage(phoneNumber, 'No encontre una cita activa para cancelar. Si quieres, revisamos los datos con el equipo.');
        return true;
    }

    await saveFlow(phoneNumber, { mode: 'confirm-cancel', data: {} });
    await sendTextMessage(phoneNumber, `¿Confirmas que quieres cancelar tu cita de ${appointment.serviceName} del ${formatHumanDateTime(appointment.startAt)}? Responde "si" para cancelar o "no" para conservarla.`);
    return true;
}

const handleAppointmentMessage = async (phoneNumber, message) => {
    const flow = await getFlow(phoneNumber);
    if(flow) {
        if(isNegative(message) && flow.mode !== 'confirm-cancel') {
            await clearFlow(phoneNumber);
            await sendTextMessage(phoneNumber, 'Sin problema, dejamos pendiente la agendacion. Cuando gustes, retomamos.');
            return true;
        }

        return continueAppointmentFlow(phoneNumber, message, flow);
    }

    if(hasConfirmIntent(message)) return confirmLatestAppointment(phoneNumber);
    if(hasCancelIntent(message)) return startCancelFlow(phoneNumber);
    if(hasRescheduleIntent(message)) return startAppointmentFlow(phoneNumber, message, 'reschedule');
    if(hasAppointmentIntent(message) || looksLikeAppointmentRequest(message)) return startAppointmentFlow(phoneNumber, message, 'create');

    return false;
}

const prepareAppointmentFlow = async (phoneNumber) => {
    await saveFlow(phoneNumber, {
        mode: 'create',
        data: {},
        waitingFor: 'quick_intake'
    });
}

module.exports = { handleAppointmentMessage, startAppointmentFlow, prepareAppointmentFlow }
