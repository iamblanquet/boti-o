const { normalizeText } = require('../../utils/configCitas');
const {
    parseDateText,
    parseTimeText,
    parsePeopleText
} = require('../../utils/dateTime');
const ServicesRepository = require('../servicesRepository');
const {
    WEEKDAY_NAMES,
    hasAppointmentIntent,
    hasAvailabilityIntent,
    parseAppointmentButtonPayload
} = require('./reglas');

const findCatalogService = async (message) => ServicesRepository.toAppointmentService(
    await ServicesRepository.findServiceByName(message)
);

const getCatalogServiceById = async (id) => ServicesRepository.toAppointmentService(
    await ServicesRepository.getServiceById(id)
);

const extractAppointmentData = async (message) => {
    const buttonPayload = parseAppointmentButtonPayload(message);
    const hasButtonPayload = Boolean(buttonPayload.categoryId || buttonPayload.serviceId || buttonPayload.date || buttonPayload.time || buttonPayload.people);
    const service = buttonPayload.serviceId ? await getCatalogServiceById(buttonPayload.serviceId) : await findCatalogService(message);

    if(hasButtonPayload) {
        return {
            categoryId: buttonPayload.categoryId,
            serviceId: service?.id,
            serviceName: service?.name,
            durationMinutes: service?.durationMinutes,
            price: service?.price,
            personPrices: service?.personPrices,
            date: buttonPayload.date,
            time: buttonPayload.time,
            people: buttonPayload.people
        };
    }

    return {
        serviceId: service?.id,
        serviceName: service?.name,
        durationMinutes: service?.durationMinutes,
        price: service?.price,
        personPrices: service?.personPrices,
        date: buttonPayload.date || parseDateText(message),
        time: buttonPayload.time || parseTimeText(message),
        people: buttonPayload.people || parsePeopleText(message)
    };
}

const mergeDefinedData = async (currentData, extractedData) => {
    const merged = { ...currentData };
    Object.entries(extractedData || {}).forEach(([key, value]) => {
        if(value !== null && value !== undefined && value !== '') merged[key] = value;
    });

    if(merged.serviceId && (!merged.durationMinutes || !Array.isArray(merged.personPrices))) {
        const service = await getCatalogServiceById(merged.serviceId);
        if(service) {
            merged.serviceName = service.name;
            merged.durationMinutes = service.durationMinutes;
            merged.price = service.price;
            merged.personPrices = service.personPrices;
        }
    }

    return merged;
}

const looksLikeAppointmentRequest = async (message) => {
    const data = await extractAppointmentData(message);
    return Boolean(data.serviceId && (data.date || data.time));
}

const looksLikeAvailabilityRequest = async (message) => {
    const value = normalizeText(message).trim();
    const data = await extractAppointmentData(message);
    const wordCount = value.split(/\s+/).filter(Boolean).length;
    const hasKnownDay = WEEKDAY_NAMES.some((day) => value.includes(day));

    return hasAvailabilityIntent(message) ||
        Boolean(data.date && (wordCount <= 5 || hasAppointmentIntent(message) || hasKnownDay)) ||
        Boolean(data.time && hasAppointmentIntent(message));
}

const looksLikeKnowledgeQuestion = (message) => {
    const value = normalizeText(message);
    return [
        'precio', 'cuanto cuesta', 'costo', 'incluye', 'que incluye',
        'promocion', 'promociones', 'paquete', 'ubicacion', 'horario',
        'servicios', 'tratamiento', 'tratamientos', 'recomiendas',
        'que es', 'como funciona', 'duele', 'duracion'
    ].some((keyword) => value.includes(keyword));
}

module.exports = {
    findCatalogService,
    getCatalogServiceById,
    extractAppointmentData,
    mergeDefinedData,
    looksLikeAppointmentRequest,
    looksLikeAvailabilityRequest,
    looksLikeKnowledgeQuestion
};
