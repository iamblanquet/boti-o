const Messages = require('../../messages');
const StateStore = require('../../stateStore');
const { getFlow, saveFlow, clearFlow, getAppointment, getUpcomingActiveAppointments } = require('../almacenamiento');
const { sendAvailableDayButtons, sendAvailableTimeButtons } = require('../preguntas');
const { confirmAppointmentById, cancelAppointmentById } = require('../confirmacionCancelacion');
const { STEPS, isManagementFlow, createFlow } = require('./estado');
const { sendAppointmentSelection, sendActionMenu, sendCancelConfirmation, sendRescheduleConfirmation } = require('./mensajes');
const { validateProposedSlot, applyReschedule } = require('./reprogramacion');
const { getMessage } = require('../../../utils/systemMessageLoader');

const sendText = (phoneNumber, text) => Messages.sendTextMessage(text, phoneNumber);
const actionPayload = (message) => {
    const value = String(message || '').trim();
    const match = value.match(/^appt_manage_(select|confirm|reschedule|cancel|cancel_yes|reschedule_yes|keep)_([a-f0-9-]+)$/i);
    return match ? { action: match[1], appointmentId: match[2] } : null;
};

const isManagementPayload = (message) => Boolean(actionPayload(message));
const closedActionKey = (phoneNumber, appointmentId) => `${phoneNumber}:appointment:management:closed:${appointmentId}`;
const closeManagementAction = async (phoneNumber, appointmentId, outcome) => {
    await clearFlow(phoneNumber);
    await StateStore.set(closedActionKey(phoneNumber, appointmentId), outcome, 86400);
};

const handleExpiredAction = async (phoneNumber, message) => {
    const payload = actionPayload(message);
    if(!payload) return false;
    const outcome = await StateStore.get(closedActionKey(phoneNumber, payload.appointmentId));
    const outcomeText = outcome === 'rescheduled'
        ? 'Ese cambio de cita ya fue confirmado.'
        : outcome === 'cancelled'
            ? 'Esa cita ya fue cancelada.'
            : outcome === 'kept'
                ? 'Ya conservamos tu cita como estaba.'
                : 'Esa opcion ya no esta disponible.';
    const text = getMessage('management_action_processed', { outcome: outcomeText });
    await sendText(phoneNumber, text);
    return true;
};

const isManagementIntent = (message) => {
    const value = String(message || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return ['gestionar cita', 'gestionar mis citas', 'mis citas', 'reagendar', 'reprogramar', 'cambiar cita', 'cambiar mi cita', 'mover mi cita', 'cancelar cita', 'cancelar mi cita', 'confirmar cita'].some((intent) => value.includes(intent));
};

const getOwnedAppointment = async (phoneNumber, appointmentId) => {
    const appointment = appointmentId ? await getAppointment(appointmentId) : null;
    return appointment?.phoneNumber === phoneNumber ? appointment : null;
};

const start = async (phoneNumber) => {
    const appointments = await getUpcomingActiveAppointments(phoneNumber);
    if(!appointments.length) {
        await clearFlow(phoneNumber);
        await sendText(phoneNumber, getMessage('management_no_appointments'));
        return true;
    }
    if(appointments.length === 1) {
        const appointment = appointments[0];
        await saveFlow(phoneNumber, createFlow(STEPS.SELECT_ACTION, { appointmentId: appointment.id }));
        await sendActionMenu(phoneNumber, appointment);
        return true;
    }
    await saveFlow(phoneNumber, createFlow(STEPS.SELECT_APPOINTMENT));
    await sendAppointmentSelection(phoneNumber, appointments);
    return true;
};

const selectAppointment = async (phoneNumber, appointmentId) => {
    const appointment = await getOwnedAppointment(phoneNumber, appointmentId);
    if(!appointment || !['pendiente', 'confirmada'].includes(appointment.status)) {
        await sendText(phoneNumber, getMessage('management_unavailable_appointment'));
        return start(phoneNumber);
    }
    await saveFlow(phoneNumber, createFlow(STEPS.SELECT_ACTION, { appointmentId }));
    await sendActionMenu(phoneNumber, appointment);
    return true;
};

const startReschedule = async (phoneNumber, appointment) => {
    await saveFlow(phoneNumber, createFlow(STEPS.SELECT_DATE, { appointmentId: appointment.id, date: null, time: null }));
    return sendAvailableDayButtons(phoneNumber, { ...appointment, appointmentId: appointment.id });
};

const handleDate = async (phoneNumber, flow, date) => {
    if(!date) return sendAvailableDayButtons(phoneNumber, { ...flow.data, appointmentId: flow.data.appointmentId });
    const appointment = await getOwnedAppointment(phoneNumber, flow.data.appointmentId);
    if(!appointment) return start(phoneNumber);
    await saveFlow(phoneNumber, createFlow(STEPS.SELECT_TIME, { appointmentId: appointment.id, date, time: null }));
    return sendAvailableTimeButtons(phoneNumber, { ...appointment, appointmentId: appointment.id, date });
};

const handleTime = async (phoneNumber, flow, time) => {
    if(!time) return sendAvailableTimeButtons(phoneNumber, flow.data);
    const appointment = await getOwnedAppointment(phoneNumber, flow.data.appointmentId);
    if(!appointment) return start(phoneNumber);
    const slot = await validateProposedSlot(appointment, flow.data.date, time);
    if(!slot.valid) {
        await sendText(phoneNumber, getMessage('slot_not_available'));
        return sendAvailableTimeButtons(phoneNumber, { ...appointment, appointmentId: appointment.id, date: flow.data.date });
    }
    const nextFlow = createFlow(STEPS.CONFIRM_RESCHEDULE, { appointmentId: appointment.id, date: flow.data.date, time });
    await saveFlow(phoneNumber, nextFlow);
    return sendRescheduleConfirmation(phoneNumber, appointment, slot.start);
};

const handleMessage = async (phoneNumber, message, suppliedFlow = null) => {
    const flow = suppliedFlow || await getFlow(phoneNumber);
    if(!isManagementFlow(flow)) return false;
    const payload = actionPayload(message);
    const appointmentId = payload?.appointmentId || flow.data?.appointmentId;

    if(flow.waitingFor === STEPS.SELECT_APPOINTMENT) return payload?.action === 'select'
        ? selectAppointment(phoneNumber, appointmentId)
        : start(phoneNumber);

    const appointment = await getOwnedAppointment(phoneNumber, appointmentId);
    if(!appointment) return start(phoneNumber);

    if(flow.waitingFor === STEPS.SELECT_ACTION) {
        if(payload?.action === 'confirm') {
            const handled = await confirmAppointmentById(phoneNumber, appointment.id);
            await closeManagementAction(phoneNumber, appointment.id, 'confirmed');
            return handled;
        }
        if(payload?.action === 'reschedule') return startReschedule(phoneNumber, appointment);
        if(payload?.action === 'cancel') {
            await saveFlow(phoneNumber, createFlow(STEPS.CONFIRM_CANCEL, { appointmentId: appointment.id }));
            return sendCancelConfirmation(phoneNumber, appointment);
        }
        return sendActionMenu(phoneNumber, appointment);
    }

    if(flow.waitingFor === STEPS.SELECT_DATE) {
        const datesPageMatch = String(message || '').match(/^appt_dates_page_(\d+)$/);
        if(datesPageMatch) {
            const page = Number(datesPageMatch[1]);
            flow.data.datesPage = page;
            await saveFlow(phoneNumber, flow);
            return sendAvailableDayButtons(
                phoneNumber,
                { ...flow.data, appointmentId: flow.data.appointmentId },
                page
            );
        }
        const normalizedMsg = String(message || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if(/(ver\s+)?m[a]s\s+fechas|(otras?\s+fechas)/.test(normalizedMsg)) {
            const page = (flow.data?.datesPage || 1) + 1;
            flow.data.datesPage = page;
            await saveFlow(phoneNumber, flow);
            return sendAvailableDayButtons(
                phoneNumber,
                { ...flow.data, appointmentId: flow.data.appointmentId },
                page
            );
        }
        const dateMatch = String(message || '').match(/^appt_date_(\d{4}-\d{2}-\d{2})$/);
        return handleDate(phoneNumber, flow, dateMatch?.[1]);
    }
    if(flow.waitingFor === STEPS.SELECT_TIME) {
        const timeMatch = String(message || '').match(/^appt_time_(\d{2})-(\d{2})$/);
        return handleTime(phoneNumber, flow, timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null);
    }
    if(flow.waitingFor === STEPS.CONFIRM_CANCEL) {
        if(payload?.action === 'cancel_yes') {
            const handled = await cancelAppointmentById(phoneNumber, appointment.id);
            await closeManagementAction(phoneNumber, appointment.id, 'cancelled');
            return handled;
        }
        if(payload?.action === 'keep') {
            await closeManagementAction(phoneNumber, appointment.id, 'kept');
            await sendText(phoneNumber, getMessage('management_keep'));
            return true;
        }
        return sendCancelConfirmation(phoneNumber, appointment);
    }
    if(flow.waitingFor === STEPS.CONFIRM_RESCHEDULE) {
        if(payload?.action === 'reschedule_yes') {
            const result = await applyReschedule(appointment, flow.data.date, flow.data.time);
            if(!result.valid) return handleTime(phoneNumber, flow, null);
            await closeManagementAction(phoneNumber, appointment.id, 'rescheduled');
            await sendText(phoneNumber, getMessage('management_reschedule_success', {
                datetime: result.start ? require('../../../utils/dateTime').formatHumanDateTime(result.start) : 'el nuevo horario'
            }));
            return true;
        }
        if(payload?.action === 'keep') {
            await closeManagementAction(phoneNumber, appointment.id, 'kept');
            await sendText(phoneNumber, getMessage('management_keep'));
            return true;
        }
        return sendRescheduleConfirmation(phoneNumber, appointment, require('../../../utils/dateTime').combineDateTime(flow.data.date, flow.data.time));
    }
    return false;
};

module.exports = {
    start,
    handleMessage,
    isManagementFlow,
    isManagementIntent,
    isManagementPayload,
    handleExpiredAction,
    actionPayload
};
