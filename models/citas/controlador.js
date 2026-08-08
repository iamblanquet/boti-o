const {
    getFlow,
    saveFlow,
    clearFlow,
    getLatestActiveAppointment
} = require('./almacenamiento');
const Messages = require('../messages');
const { extractAppointmentDetails } = require('./extractor');
const {
    FLOW_MODE_CREATE,
    FLOW_MODE_RESCHEDULE,
    FLOW_MODE_CANCEL,
    FLOW_MODE_PENDING_CONFIRMATION,
    hasAppointmentIntent,
    hasRescheduleIntent,
    hasCancelIntent,
    hasConfirmIntent,
    isAffirmative,
    isNegative,
    parseAppointmentActionPayload,
    parseAppointmentButtonPayload,
    nextMissingField,
    hasExpectedField,
    hasAnyAppointmentData
} = require('./reglas');
const {
    extractAppointmentData,
    mergeDefinedData,
    looksLikeAppointmentRequest,
    looksLikeAvailabilityRequest,
    looksLikeKnowledgeQuestion
} = require('./datos');
const {
    sendServiceButtonsByCategory,
    askForField
} = require('./preguntas');
const {
    sendConfirmButtons,
    confirmAppointmentById,
    cancelAppointmentById,
    confirmLatestAppointment,
    continueCancelFlow,
    startCancelFlow
} = require('./confirmacionCancelacion');
const {
    validateSelectedSlot,
    createOrReschedule
} = require('./agenda');
const { getDataFromMessage } = require('./lectorMensaje');
const ServicesRepository = require('../servicesRepository');
const { isPeopleAllowed, getPriceForPeople } = require('./precios');

const sendTextMessage = (phoneNumber, message) => Messages.sendTextMessage(message, phoneNumber);
const isCatalogUnavailableError = (error) => error?.code === 'SERVICE_CATALOG_UNAVAILABLE' ||
    error instanceof ServicesRepository.ServiceCatalogUnavailableError;

const sendToAiDuringFlow = async (phoneNumber, message) => {
    const Gemini = require('../gemini');
    await Gemini.geminiProccess(message, phoneNumber);
    return true;
}

const saveFlowAndAsk = async (phoneNumber, flow, field) => {
    flow.waitingFor = field;
    await saveFlow(phoneNumber, flow);
    return askForField(phoneNumber, field, flow.data);
}

const continueGuidedFlow = async (phoneNumber, flow) => {
    const slotIsValid = await validateSelectedSlot(phoneNumber, flow);
    if(!slotIsValid) return true;

    const missing = nextMissingField(flow.data);
    if(missing) return saveFlowAndAsk(phoneNumber, flow, missing);
    return createOrReschedule({ phoneNumber, flow });
}

const iniciarFlujoCita = async (phoneNumber, message, mode = FLOW_MODE_CREATE) => {
    const extractedByAi = await extractAppointmentDetails({ message });
    let data = await mergeDefinedData(await extractAppointmentData(message), extractedByAi);

    const flow = { mode, data, waitingFor: null };

    if(mode === FLOW_MODE_RESCHEDULE) {
        const appointment = await getLatestActiveAppointment(phoneNumber);
        if(!appointment) {
            await sendTextMessage(phoneNumber, 'No encontre una cita activa para reprogramar con este numero. Si quieres, podemos agendar una nueva.');
            return true;
        }

        flow.appointmentId = appointment.id;
        flow.data = {
            name: appointment.name,
            serviceId: appointment.serviceId,
            serviceName: appointment.serviceName,
            durationMinutes: appointment.durationMinutes,
            people: appointment.people,
            participantNames: appointment.participantNames || [],
            date: data.date,
            time: data.time
        };
    }

    return continueGuidedFlow(phoneNumber, flow);
}

const continuarFlujoCita = async (phoneNumber, message, flow) => {
    if(hasCancelIntent(message) && flow.mode !== FLOW_MODE_CANCEL) {
        await clearFlow(phoneNumber);
        return startCancelFlow(phoneNumber);
    }

    const appointmentButtonPayload = parseAppointmentButtonPayload(message);
    if(flow.waitingFor === 'service' && appointmentButtonPayload.categoryId) {
        return sendServiceButtonsByCategory(phoneNumber, appointmentButtonPayload.categoryId);
    }
    if(flow.waitingFor === 'date') {
        if(appointmentButtonPayload.datesPage) {
            flow.data.datesPage = appointmentButtonPayload.datesPage;
            await saveFlow(phoneNumber, flow);
            const { sendAvailableDayButtons } = require('./preguntas');
            return sendAvailableDayButtons(phoneNumber, flow.data, appointmentButtonPayload.datesPage);
        }
        const normalizedMsg = String(message || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if(/(ver\s+)?m[a]s\s+fechas|(otras?\s+fechas)/.test(normalizedMsg)) {
            const nextPage = (flow.data.datesPage || 1) + 1;
            flow.data.datesPage = nextPage;
            await saveFlow(phoneNumber, flow);
            const { sendAvailableDayButtons } = require('./preguntas');
            return sendAvailableDayButtons(phoneNumber, flow.data, nextPage);
        }
    }

    if(flow.mode === FLOW_MODE_PENDING_CONFIRMATION) {
        const { confirmAppointmentId, cancelAppointmentId } = parseAppointmentActionPayload(message);
        const appointmentId = confirmAppointmentId || cancelAppointmentId || flow.appointmentId;

        if(confirmAppointmentId || isAffirmative(message)) {
            return confirmAppointmentById(phoneNumber, appointmentId);
        }

        if(cancelAppointmentId || isNegative(message)) {
            return cancelAppointmentById(phoneNumber, appointmentId, {
                message: 'Listo, cancelamos esa cita. Cuando gustes, te ayudo a encontrar un nuevo horario.'
            });
        }

        await sendConfirmButtons(phoneNumber, appointmentId, 'Tengo esta cita apartada pendiente de confirmacion.');
        return true;
    }

    if(flow.mode === FLOW_MODE_CANCEL) return continueCancelFlow(phoneNumber, message, flow);

    const extracted = await getDataFromMessage(phoneNumber, flow, message);

    if(flow.waitingFor === 'participantNames' && !hasExpectedField('participantNames', extracted.data)) {
        return saveFlowAndAsk(phoneNumber, flow, 'participantNames');
    }

    if(looksLikeKnowledgeQuestion(message) && !hasAppointmentIntent(message) && !(await looksLikeAvailabilityRequest(message))) {
        return sendToAiDuringFlow(phoneNumber, message);
    }

    if(flow.waitingFor && !hasExpectedField(flow.waitingFor, extracted.data)) {
        if(looksLikeKnowledgeQuestion(message) || !hasAnyAppointmentData(extracted.manual)) {
            return sendToAiDuringFlow(phoneNumber, message);
        }
    }

    if(extracted.data.people && Array.isArray(extracted.data.personPrices)) {
        if(!isPeopleAllowed(extracted.data.personPrices, extracted.data.people)) {
            extracted.data.people = null;
            extracted.data.selectedPrice = null;
            return saveFlowAndAsk(phoneNumber, { ...flow, data: extracted.data }, 'people');
        }
        extracted.data.selectedPrice = getPriceForPeople(extracted.data.personPrices, extracted.data.people);
    }

    flow.data = extracted.data;
    return continueGuidedFlow(phoneNumber, flow);
}

const prepararFlujoCita = async (phoneNumber) => {
    const flow = {
        mode: FLOW_MODE_CREATE,
        data: {},
        waitingFor: 'service'
    };
    await saveFlow(phoneNumber, flow);
    return askForField(phoneNumber, 'service', flow.data);
}

const handleAppointmentMessage = async (phoneNumber, message) => {
    try {
        const { confirmAppointmentId, cancelAppointmentId } = parseAppointmentActionPayload(message);
        if(confirmAppointmentId) return confirmAppointmentById(phoneNumber, confirmAppointmentId);
        if(cancelAppointmentId) {
            return cancelAppointmentById(phoneNumber, cancelAppointmentId, {
                message: 'Listo, ya cancele esa cita y libere el espacio en calendario. Cuando quieras, te ayudo a encontrar otro horario.'
            });
        }

        const flow = await getFlow(phoneNumber);
        if(flow?.mode === FLOW_MODE_CANCEL) return continuarFlujoCita(phoneNumber, message, flow);
        if(hasCancelIntent(message)) return startCancelFlow(phoneNumber);

        if(flow) {
            if(isNegative(message) && ![FLOW_MODE_CANCEL, FLOW_MODE_PENDING_CONFIRMATION].includes(flow.mode)) {
                await clearFlow(phoneNumber);
                await sendTextMessage(phoneNumber, 'Sin problema, dejamos pendiente la agendacion. Cuando gustes, retomamos.');
                return true;
            }

            return continuarFlujoCita(phoneNumber, message, flow);
        }

        if(hasConfirmIntent(message) || isAffirmative(message)) return confirmLatestAppointment(phoneNumber);
        if(hasRescheduleIntent(message)) return iniciarFlujoCita(phoneNumber, message, FLOW_MODE_RESCHEDULE);
        if(hasAppointmentIntent(message) || await looksLikeAppointmentRequest(message) || await looksLikeAvailabilityRequest(message)) {
            return iniciarFlujoCita(phoneNumber, message, FLOW_MODE_CREATE);
        }

        return false;
    } catch (error) {
        if(isCatalogUnavailableError(error)) {
            console.error('Appointment catalog unavailable:', error.cause?.message || error.message);
            await sendTextMessage(phoneNumber, ServicesRepository.CATALOG_UNAVAILABLE_MESSAGE);
            return true;
        }

        throw error;
    }
}

module.exports = {
    handleAppointmentMessage,
    iniciarFlujoCita,
    prepararFlujoCita
};
