const Messages = require('./messages');
const StateManager = require('./conversationStateManager');
const ClientsStorage = require('./clientes/almacenamiento');
const AppointmentsStorage = require('./citas/almacenamiento');
const GoogleCalendar = require('./googleCalendar');
const { getMessage } = require('../utils/systemMessageLoader');

const MEDICAL_CONDITION_INTENT = 'medical_condition';
const MEDICAL_CONDITION_ACTION_PREFIX = 'appt_medical_condition_';
const MAX_CONDITION_LENGTH = 1000;

const getMedicalConditionActionId = (appointmentId) => `${MEDICAL_CONDITION_ACTION_PREFIX}${appointmentId}`;
const getAppointmentIdFromAction = (message) => String(message || '').match(/^appt_medical_condition_(.+)$/)?.[1] || null;

const appendMedicalConditionNote = (notes, condition) => [
    String(notes || '').trim(),
    `[Información médica relevante] ${condition}`
].filter(Boolean).join('\n\n');

const start = async (phoneNumber, appointmentId) => {
    if(!appointmentId) return false;
    await StateManager.saveState({
        phone: phoneNumber,
        intent: MEDICAL_CONDITION_INTENT,
        step: 'awaiting_condition',
        data: { appointmentId }
    });
    await Messages.sendTextMessage(getMessage('medical_condition_prompt'), phoneNumber, { source: 'bot' });
    return true;
};

const saveCondition = async (phoneNumber, appointmentId, condition) => {
    const appointment = await AppointmentsStorage.getAppointment(appointmentId);
    if(!appointment || appointment.phoneNumber !== phoneNumber || appointment.status !== 'confirmada') return false;

    const savedAppointment = await AppointmentsStorage.saveAppointment({
        ...appointment,
        medicalCondition: condition
    });

    const client = await ClientsStorage.getClient(phoneNumber) || { phoneNumber, name: appointment.name };
    await ClientsStorage.saveClient({
        ...client,
        phoneNumber,
        notes: appendMedicalConditionNote(client.notes, condition)
    });

    if(savedAppointment?.eventId) {
        try {
            await GoogleCalendar.updateAppointmentEvent({
                eventId: savedAppointment.eventId,
                appointment: savedAppointment,
                start: new Date(savedAppointment.startAt),
                end: new Date(savedAppointment.endAt)
            });
        } catch (error) {
            console.error('No se pudo sincronizar la información médica con Google Calendar:', error.message);
        }
    }

    return true;
};

const handleMessage = async ({ phoneNumber, messageText, activeState }) => {
    const appointmentIdFromAction = getAppointmentIdFromAction(messageText);
    if(appointmentIdFromAction) {
        const started = await start(phoneNumber, appointmentIdFromAction);
        return started ? { handledBy: 'medical-condition-start' } : null;
    }

    if(activeState?.intent !== MEDICAL_CONDITION_INTENT || activeState.step !== 'awaiting_condition') return null;

    const value = String(messageText || '').trim();
    if(['cancelar', 'no', 'no gracias'].includes(value.toLowerCase())) {
        await StateManager.clearState(phoneNumber);
        await Messages.sendTextMessage(getMessage('medical_condition_cancelled'), phoneNumber, { source: 'bot' });
        return { handledBy: 'medical-condition-cancelled' };
    }

    if(!value) {
        await Messages.sendTextMessage(getMessage('medical_condition_prompt'), phoneNumber, { source: 'bot' });
        return { handledBy: 'medical-condition-repeat' };
    }

    const condition = value.slice(0, MAX_CONDITION_LENGTH);
    const saved = await saveCondition(phoneNumber, activeState.data?.appointmentId, condition);
    await StateManager.clearState(phoneNumber);
    await Messages.sendTextMessage(
        getMessage(saved ? 'medical_condition_saved' : 'medical_condition_unavailable'),
        phoneNumber,
        { source: 'bot' }
    );
    return { handledBy: saved ? 'medical-condition-saved' : 'medical-condition-unavailable' };
};

module.exports = {
    MEDICAL_CONDITION_INTENT,
    getMedicalConditionActionId,
    getAppointmentIdFromAction,
    appendMedicalConditionNote,
    start,
    saveCondition,
    handleMessage
};
