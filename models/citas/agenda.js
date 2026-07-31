const {
    combineDateTime,
    addMinutes,
    isWithinBusinessHours,
    formatHumanDateTime
} = require('../../utils/dateTime');
const {
    createAppointmentEvent,
    updateAppointmentEvent
} = require('../googleCalendar');
const {
    saveFlow,
    saveAppointment,
    getLatestActiveAppointment
} = require('./almacenamiento');
const Messages = require('../messages');
const {
    FLOW_MODE_RESCHEDULE,
    FLOW_MODE_PENDING_CONFIRMATION,
    getBookingDuration
} = require('./reglas');
const { getBusinessHoursText } = require('./formato');
const { sendAvailableTimeButtons } = require('./preguntas');
const { sendConfirmButtons } = require('./confirmacionCancelacion');
const { checkAvailability } = require('./verificadorDisponibilidad');
const { getMessage } = require('../../utils/systemMessageLoader');
const { formatPrice } = require('../responseTemplates');

const sendTextMessage = (phoneNumber, message) => Messages.sendTextMessage(message, phoneNumber);

const resetTimeAndSave = async (phoneNumber, flow) => {
    flow.data.time = null;
    flow.data.slotValidated = false;
    flow.waitingFor = 'time';
    await saveFlow(phoneNumber, flow);
}

const validateSelectedSlot = async (phoneNumber, flow) => {
    const data = flow.data;
    if(!data.serviceId || !data.date || !data.time) return true;
    if(data.slotValidated) return true;

    const durationMinutes = getBookingDuration(data);
    const start = combineDateTime(data.date, data.time);
    const end = addMinutes(start, durationMinutes);

    if(start < new Date() || !isWithinBusinessHours(start, durationMinutes)) {
        await resetTimeAndSave(phoneNumber, flow);
        await sendTextMessage(phoneNumber, getMessage('slot_out_of_hours', { hours: getBusinessHoursText() }));
        await sendAvailableTimeButtons(phoneNumber, flow.data);
        return false;
    }

    const availability = await checkAvailability(start, end, {
        excludeAppointmentId: flow.appointmentId
    });
    if(!availability.available) {
        await resetTimeAndSave(phoneNumber, flow);
        await sendTextMessage(phoneNumber, getMessage('slot_not_available'));
        await sendAvailableTimeButtons(phoneNumber, flow.data);
        return false;
    }

    flow.data.slotValidated = true;
    flow.data.availabilitySource = availability.source;
    await saveFlow(phoneNumber, flow);
    return true;
}

const createOrReschedule = async ({ phoneNumber, flow }) => {
    const data = { ...flow.data, durationMinutes: getBookingDuration(flow.data) };
    const start = combineDateTime(data.date, data.time);
    const end = addMinutes(start, data.durationMinutes);

    if(start < new Date()) {
        await resetTimeAndSave(phoneNumber, flow);
        await sendTextMessage(phoneNumber, getMessage('slot_expired'));
        return sendAvailableTimeButtons(phoneNumber, flow.data);
    }

    if(!isWithinBusinessHours(start, data.durationMinutes)) {
        await resetTimeAndSave(phoneNumber, flow);
        await sendTextMessage(phoneNumber, getMessage('slot_out_of_hours', { hours: getBusinessHoursText() }));
        return sendAvailableTimeButtons(phoneNumber, flow.data);
    }

    const availability = await checkAvailability(start, end, {
        excludeAppointmentId: flow.appointmentId
    });
    if(!availability.available) {
        await resetTimeAndSave(phoneNumber, flow);
        await sendTextMessage(phoneNumber, getMessage('slot_not_available'));
        return sendAvailableTimeButtons(phoneNumber, flow.data);
    }

    const appointment = {
        ...data,
        price: data.selectedPrice ?? data.price ?? null,
        phoneNumber,
        createdAt: new Date().toISOString(),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status: 'pendiente',
        source: availability.source === 'google' ? 'google-calendar' : 'local-calendar-fallback'
    };

    if(flow.mode === FLOW_MODE_RESCHEDULE && flow.appointmentId) {
        const previous = await getLatestActiveAppointment(phoneNumber);
        const updated = { ...previous, ...appointment, id: flow.appointmentId, status: 'pendiente' };
        let eventId = previous?.eventId || null;
        if(availability.source === 'google' && eventId) {
            try {
                const event = await updateAppointmentEvent({ eventId, appointment: updated, start, end });
                eventId = event.id;
            } catch (error) {
                console.error('Google Calendar reschedule fallback:', error.message);
                eventId = null;
                updated.source = 'local-calendar-fallback';
            }
        }
        const savedAppointment = await saveAppointment({ ...updated, eventId });
        await saveFlow(phoneNumber, {
            mode: FLOW_MODE_PENDING_CONFIRMATION,
            appointmentId: savedAppointment.id,
            data: {}
        });
        await sendConfirmButtons(phoneNumber, savedAppointment.id, getMessage('reschedule_success', { datetime: formatHumanDateTime(start) }));
        return true;
    }

    let eventId = null;
    if(availability.source === 'google') {
        try {
            const event = await createAppointmentEvent({ appointment, start, end });
            eventId = event.id;
        } catch (error) {
            console.error('Google Calendar create fallback:', error.message);
            appointment.source = 'local-calendar-fallback';
        }
    }
    const savedAppointment = await saveAppointment({ ...appointment, eventId });
    await saveFlow(phoneNumber, {
        mode: FLOW_MODE_PENDING_CONFIRMATION,
        appointmentId: savedAppointment.id,
        data: {}
    });
    const confirmationText = getMessage('booking_success', {
        service: data.serviceName,
        datetime: formatHumanDateTime(start),
        name: data.name
    });
    const priceSummary = data.selectedPrice !== null && data.selectedPrice !== undefined
        ? `Inversión total: ${formatPrice(data.selectedPrice)}.`
        : '';
    await sendConfirmButtons(
        phoneNumber,
        savedAppointment.id,
        [confirmationText, priceSummary].filter(Boolean).join('\n\n')
    );
    return true;
}

module.exports = {
    validateSelectedSlot,
    createOrReschedule
};
