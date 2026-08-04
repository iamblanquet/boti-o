const ServicesRepository = require('../servicesRepository');
const { formatHumanDateTime } = require('../../utils/dateTime');
const { getMessage } = require('../../utils/systemMessageLoader');

const CARE_FIELDS = {
    before: 'cuidadosPrevios',
    after: 'cuidadosPosteriores'
};

const FALLBACK_MESSAGES = {
    before: 'appointment_confirmation_care',
    after: 'appointment_post_care'
};

const applyCareVariables = (message, appointment = {}) => {
    const startAt = new Date(appointment.startAt);
    const dateTime = Number.isNaN(startAt.getTime()) ? '' : formatHumanDateTime(startAt);

    return String(message || '')
        .replace(/{{name}}/g, appointment.name || 'cliente')
        .replace(/{{service}}/g, appointment.serviceName || 'tu servicio')
        .replace(/{{datetime}}/g, dateTime);
};

const getServiceCareMessage = async (appointment, timing) => {
    const fallback = getMessage(FALLBACK_MESSAGES[timing]);
    if(!appointment?.serviceId || !CARE_FIELDS[timing]) return applyCareVariables(fallback, appointment);

    try {
        const service = await ServicesRepository.getServiceById(appointment.serviceId);
        const message = String(service?.[CARE_FIELDS[timing]] || '').trim();
        return applyCareVariables(message || fallback, appointment);
    } catch (error) {
        console.error(`No se pudo obtener el cuidado ${timing === 'before' ? 'previo' : 'posterior'} del servicio ${appointment.serviceId}:`, error.message);
        return applyCareVariables(fallback, appointment);
    }
};

module.exports = {
    applyCareVariables,
    getServiceCareMessage
};
