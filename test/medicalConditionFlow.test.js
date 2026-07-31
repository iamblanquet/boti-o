const test = require('node:test');
const assert = require('node:assert/strict');

const Messages = require('../models/messages');
const StateManager = require('../models/conversationStateManager');
const ClientsStorage = require('../models/clientes/almacenamiento');
const AppointmentsStorage = require('../models/citas/almacenamiento');
const GoogleCalendar = require('../models/googleCalendar');
const ChatStore = require('../models/chatStore');
const MedicalConditionFlow = require('../models/medicalConditionFlow');

test('medical condition flow saves the response in CRM and the confirmed calendar appointment', async () => {
    const originals = {
        sendTextMessage: Messages.sendTextMessage,
        saveState: StateManager.saveState,
        clearState: StateManager.clearState,
        getClient: ClientsStorage.getClient,
        saveClient: ClientsStorage.saveClient,
        getAppointment: AppointmentsStorage.getAppointment,
        saveAppointment: AppointmentsStorage.saveAppointment,
        updateAppointmentEvent: GoogleCalendar.updateAppointmentEvent,
        setAlert: ChatStore.setAlert
    };
    const savedStates = [];
    const savedAppointments = [];
    const savedClients = [];
    const calendarUpdates = [];
    const sent = [];
    const alerts = [];
    const phoneNumber = '5219990000000';
    const appointment = {
        id: 'appointment-1',
        phoneNumber,
        name: 'Ana López',
        serviceName: 'Masaje Relajante',
        status: 'confirmada',
        eventId: 'calendar-event-1',
        startAt: '2026-08-01T16:00:00.000Z',
        endAt: '2026-08-01T17:00:00.000Z'
    };

    Messages.sendTextMessage = async (text, phone) => sent.push({ text, phone });
    StateManager.saveState = async (state) => savedStates.push(state);
    StateManager.clearState = async () => true;
    ClientsStorage.getClient = async () => ({ phoneNumber, name: 'Ana López', notes: 'Cliente frecuente' });
    ClientsStorage.saveClient = async (client) => savedClients.push(client);
    AppointmentsStorage.getAppointment = async () => appointment;
    AppointmentsStorage.saveAppointment = async (value) => {
        savedAppointments.push(value);
        return value;
    };
    GoogleCalendar.updateAppointmentEvent = async (payload) => {
        calendarUpdates.push(payload);
        return payload;
    };
    ChatStore.setAlert = (phone, alert) => alerts.push({ phone, alert });

    try {
        const actionId = MedicalConditionFlow.getMedicalConditionActionId(appointment.id);
        const started = await MedicalConditionFlow.handleMessage({ phoneNumber, messageText: actionId, activeState: null });
        assert.equal(started.handledBy, 'medical-condition-start');
        assert.equal(savedStates[0].data.appointmentId, appointment.id);

        const saved = await MedicalConditionFlow.handleMessage({
            phoneNumber,
            messageText: 'Alergia al aceite de almendras',
            activeState: {
                intent: MedicalConditionFlow.MEDICAL_CONDITION_INTENT,
                step: 'awaiting_condition',
                data: { appointmentId: appointment.id }
            }
        });

        assert.equal(saved.handledBy, 'medical-condition-saved');
        assert.equal(savedAppointments[0].medicalCondition, 'Alergia al aceite de almendras');
        assert.match(savedClients[0].notes, /Información médica relevante/);
        assert.match(savedClients[0].notes, /almendras/);
        assert.equal(calendarUpdates[0].appointment.medicalCondition, 'Alergia al aceite de almendras');
        assert.equal(alerts[0].alert.type, 'medical_condition');
        assert.equal(alerts[0].alert.message, 'Alergia al aceite de almendras');
        assert.match(sent.at(-1).text, /Ya registramos esta información/i);
    } finally {
        Messages.sendTextMessage = originals.sendTextMessage;
        StateManager.saveState = originals.saveState;
        StateManager.clearState = originals.clearState;
        ClientsStorage.getClient = originals.getClient;
        ClientsStorage.saveClient = originals.saveClient;
        AppointmentsStorage.getAppointment = originals.getAppointment;
        AppointmentsStorage.saveAppointment = originals.saveAppointment;
        GoogleCalendar.updateAppointmentEvent = originals.updateAppointmentEvent;
        ChatStore.setAlert = originals.setAlert;
    }
});
