const ASSISTED_APPOINTMENT_TYPE = 'appointment';

class AssistedAppointmentFlowError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'AssistedAppointmentFlowError';
        this.status = status;
    }
}

const toServiceSummary = (service) => service ? {
    id: service.id,
    name: service.nombre,
    category: service.categoria || null,
    durationMinutes: service.duracionMinutos || null
} : null;

const getRequestedService = async (serviceId) => {
    if(!serviceId) return null;

    const ServicesRepository = require('./servicesRepository');
    const service = await ServicesRepository.getServiceById(serviceId);
    if(!service) {
        throw new AssistedAppointmentFlowError('Servicio no encontrado o inactivo.', 404);
    }

    return service;
}

const buildAssistedFlowMetadata = ({ service = null, startedAt = new Date().toISOString() } = {}) => ({
    type: ASSISTED_APPOINTMENT_TYPE,
    startedAt,
    service: toServiceSummary(service),
    entryPoint: service ? 'dashboard-service-offer' : 'dashboard-appointment'
});

const startAppointmentFlow = async ({ phoneNumber, serviceId = null } = {}) => {
    if(!phoneNumber) {
        throw new AssistedAppointmentFlowError('Telefono requerido.', 400);
    }

    const service = await getRequestedService(serviceId);
    const FlujoCitas = require('./citas/flujo');
    const ConversationControlStore = require('./conversationControlStore');

    if(service) {
        await FlujoCitas.iniciarConServicio(phoneNumber, service, '');
    } else {
        await FlujoCitas.preparar(phoneNumber);
    }

    const assistedFlow = buildAssistedFlowMetadata({ service });
    const control = await ConversationControlStore.startAssistedFlow(phoneNumber, assistedFlow);

    return {
        control,
        service: toServiceSummary(service),
        assistedFlow
    };
}

module.exports = {
    ASSISTED_APPOINTMENT_TYPE,
    AssistedAppointmentFlowError,
    buildAssistedFlowMetadata,
    startAppointmentFlow
};
