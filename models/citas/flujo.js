const ControladorCitas = require('./controlador');
const { getFlow, saveFlow, clearFlow } = require('./almacenamiento');
const StateManager = require('../conversationStateManager');
const GestionCitas = require('./gestion/controlador');

const INTENCION_CITA = 'agendar_cita';
const FLOW_MODE_CREATE = 'create';

const reflejarFlujoCita = async (phoneNumber) => {
    const flow = await getFlow(phoneNumber);

    if(!flow) {
        const activeState = await StateManager.getActiveState(phoneNumber);
        if (activeState && activeState.intent === INTENCION_CITA) {
            await StateManager.clearState(phoneNumber);
        }
        return null;
    }

    return StateManager.saveState({
        phone: phoneNumber,
        intent: INTENCION_CITA,
        step: flow.waitingFor || flow.mode || 'activo',
        data: {
            mode: flow.mode,
            waitingFor: flow.waitingFor || null,
            appointmentId: flow.appointmentId || null,
            appointment: flow.data || {}
        }
    });
}

const iniciar = async (phoneNumber, message) => {
    await StateManager.saveState({
        phone: phoneNumber,
        intent: INTENCION_CITA,
        step: 'iniciado',
        data: { originalMessage: message }
    });

    const handled = await ControladorCitas.iniciarFlujoCita(phoneNumber, message);
    await reflejarFlujoCita(phoneNumber);
    return handled;
}

const preparar = async (phoneNumber) => {
    await StateManager.saveState({
        phone: phoneNumber,
        intent: INTENCION_CITA,
        step: 'service',
        data: {}
    });

    const handled = await ControladorCitas.prepararFlujoCita(phoneNumber);
    await reflejarFlujoCita(phoneNumber);
    return handled;
}

const continuar = async (phoneNumber, message) => {
    const currentFlow = await getFlow(phoneNumber);
    const handled = GestionCitas.isManagementFlow(currentFlow)
        ? await GestionCitas.handleMessage(phoneNumber, message, currentFlow)
        : await ControladorCitas.handleAppointmentMessage(phoneNumber, message);
    await reflejarFlujoCita(phoneNumber);
    return handled;
}

const iniciarGestion = async (phoneNumber) => {
    const handled = await GestionCitas.start(phoneNumber);
    await reflejarFlujoCita(phoneNumber);
    return handled;
}

const iniciarConServicio = async (phoneNumber, service, message = '') => {
    await saveFlow(phoneNumber, {
        mode: FLOW_MODE_CREATE,
        data: {
            serviceId: service.id,
            serviceName: service.nombre,
            durationMinutes: service.duracionMinutos
        },
        waitingFor: null
    });

    const handled = await ControladorCitas.handleAppointmentMessage(phoneNumber, message);
    await reflejarFlujoCita(phoneNumber);
    return handled;
}

const reiniciar = async (phoneNumber) => {
    await clearFlow(phoneNumber);
    await StateManager.clearState(phoneNumber);
}

module.exports = {
    INTENCION_CITA,
    iniciar,
    preparar,
    continuar,
    iniciarConServicio,
    iniciarGestion,
    reflejarFlujoCita,
    reiniciar
};
