const Messages = require('./messages');
const clientModel = require('./clients');

const Chatgpt = require('./chatgpt');
const Gemini = require('./gemini');
const FlujoCitas = require('./citas/flujo');
const GuidedResponses = require('./guidedResponses');
const ChatStore = require('./chatStore');
const CustomerProfile = require('./customerProfile');
const StateManager = require('./conversationStateManager');
const ServicesRepository = require('./servicesRepository');
const ServiceIntentDetector = require('./servicesIntentDetector');
const ResponseTemplates = require('./responseTemplates');
const CatalogMenu = require('./catalogMenu');
const StateStore = require('./stateStore');
const GuidedFlowRunner = require('./guidedFlowRunner');
const ServiceFollowup = require('./serviceFollowup');
const ConversationControlStore = require('./conversationControlStore');
const GestionCitas = require('./citas/gestion/controlador');

const { INTENTS, DATA_FIELDS } = ServiceIntentDetector;

const resetAiContext = async (phoneNumber) => {
    await StateStore.del(`${phoneNumber}:tool`);
    await StateStore.del(`${phoneNumber}:context`);
    await StateStore.del(`${phoneNumber}:chatgpt:context`);
    await StateStore.del(`${phoneNumber}:gemini:history`);
}

const getActiveTool = async (phoneNumber, formatMessage) => {
    if(formatMessage === 'menu') {
        await resetAiContext(phoneNumber);
        return null;
    }

    return StateStore.get(`${phoneNumber}:tool`);
}

const sendTemplateText = async (phoneNumber, text) => {
    await Messages.sendTextMessage(text, phoneNumber, { source: 'bot' });
}

const isRecommendationOrDoubtRequest = (message) => {
    const value = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_ ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return [
        'recomienda',
        'recomiendas',
        'recomendacion',
        'recomendaciones',
        'recomiendame',
        'que me conviene',
        'cual me conviene',
        'que me sugieres',
        'cual me sugieres',
        'que tratamiento me sugieres',
        'que tratamiento me recomiendas',
        'que seria mejor',
        'cual seria mejor',
        'orientame',
        'asesorame',
        'tengo una duda',
        'tengo dudas',
        'una duda',
        'duda sobre',
        'dudas sobre',
        'algo para'
    ].some((keyword) => value.includes(keyword));
}

const isAffirmative = (message) => {
    const value = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return ['si', 'sii', 'claro', 'ok', 'vale', 'quiero', 'agendar', 'me gustaria'].includes(value) ||
        /^(si|sii|claro|ok|vale)\b/.test(value) ||
        ['quiero agendar', 'me gustaria agendar', 'si quiero', 'si agendamos'].some((keyword) => value.includes(keyword));
}

const isNegative = (message) => {
    const value = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return ['no', 'nop', 'despues', 'mas tarde', 'ahorita no', 'mejor no', 'no gracias', 'no por ahora'].includes(value) ||
        /(^|\s)no(\s|$)/.test(value) ||
        ['mejor no', 'por ahora no', 'de momento no', 'no quiero', 'no me interesa'].some((keyword) => value.includes(keyword));
}

const hasScheduleDetails = (message) => {
    const value = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return [
        'manana', 'hoy', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado',
        'a las', 'a la', 'alas', 'am', 'pm', 'a nombre', 'nombre de', 'me llamo', 'soy',
        'agendar', 'reservar', 'cita'
    ].some((keyword) => value.includes(keyword)) ||
        /\b\d{1,2}:\d{2}\b/.test(value) ||
        /\b(a las|a la|alas)\s+\d{1,2}\b/.test(value);
}

const isSimpleGuidedCommand = (message) => {
    const value = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_ ]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return [
        'hola',
        'buenas',
        'buenos dias',
        'buenas tardes',
        'menu',
        'inicio',
        'ayuda',
        'menu_services',
        'menu_appointment',
        'menu_ai'
    ].includes(value);
}

const shouldPrioritizeServiceIntent = (message) => {
    if(isSimpleGuidedCommand(message)) return false;
    if(isRecommendationOrDoubtRequest(message)) return true;

    const ruleIntent = ServiceIntentDetector.detectRuleIntent(message);
    if([
        INTENTS.CONSULTAR_SERVICIO,
        INTENTS.RECOMENDAR_SERVICIO,
        INTENTS.PROMOCIONES
    ].includes(ruleIntent.intent)) {
        return true;
    }

    return hasServicesListIntent(message);
}

const rememberOfferedService = async (phoneNumber, service) => {
    await ServiceFollowup.saveOfferState(phoneNumber, service);
}

const sendServiceTemplate = async (phoneNumber, service, requestedField = DATA_FIELDS.GENERAL) => {
    await sendTemplateText(phoneNumber, ResponseTemplates.serviceExact(service, requestedField));
    if(service.imagen) {
        await Messages.sendLocalMedia(service.imagen, phoneNumber, { source: 'bot' });
    }
    await rememberOfferedService(phoneNumber, service);
}

const handleServiceConsultation = async ({ phoneNumber, messageText, intent }) => {
    const service = intent.servicio
        ? await ServicesRepository.findServiceByName(intent.servicio)
        : await ServicesRepository.findServiceByName(messageText);

    if(!service) return false;

    const requestedField = intent.dato_solicitado || DATA_FIELDS.GENERAL;
    await sendServiceTemplate(phoneNumber, service, requestedField);
    return true;
}

const findServiceForAiOffer = async (messageText, aiAnswer, fallbackService = null) => {
    if(fallbackService?.id) return fallbackService;

    const fromMessage = await ServicesRepository.findServiceByName(messageText);
    if(fromMessage?.id) return fromMessage;

    if(aiAnswer) {
        const fromAnswer = await ServicesRepository.findServiceByName(aiAnswer);
        if(fromAnswer?.id) return fromAnswer;
    }

    return null;
}

const sendAiRecommendationWithActions = async ({ phoneNumber, messageText, service = null }) => {
    const result = await Gemini.geminiProccess(messageText, phoneNumber);
    const recommendedService = await findServiceForAiOffer(messageText, result?.answer, service);

    if(recommendedService?.id) {
        await ServiceFollowup.sendOfferDecisionButtons(phoneNumber, recommendedService);
    }

    return true;
}

const handleRecommendation = async ({ phoneNumber, messageText, intent }) => {
    if(!intent.problema) return false;

    return sendAiRecommendationWithActions({
        phoneNumber,
        messageText: messageText || intent.problema
    });
}

const handleFaq = async ({ phoneNumber, messageText }) => {
    const faq = await ServicesRepository.findFaqAnswer(messageText);
    if(!faq) return false;

    await sendTemplateText(phoneNumber, ResponseTemplates.faq(faq.respuesta));
    return true;
}

const handlePromotions = async ({ phoneNumber, messageText }) => {
    const service = await ServicesRepository.findServiceByName(messageText);
    const promotions = await ServicesRepository.getActivePromotions(service?.id || null);
    await sendTemplateText(phoneNumber, ResponseTemplates.promotions(promotions));
    return true;
}

const hasServicesListIntent = (message) => {
    const value = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const serviceListTerms = [
        'servicios', 'tratamientos', 'que ofrecen', 'que tiene',
        'que servicios', 'informacion acerca de sus servicios',
        'catalogo', 'menu_services'
    ];
    const categoryTerms = [
        'masaje', 'masajes', 'facial', 'faciales', 'depilacion',
        'depilaciones', 'laser', 'paquete', 'paquetes',
        'tratamientos especializados'
    ];
    const asksForInfo = ['informacion', 'info', 'me gustaria informacion', 'quiero informacion'].some((keyword) => value.includes(keyword));

    return serviceListTerms.some((keyword) => value.includes(keyword)) ||
        (asksForInfo && categoryTerms.some((keyword) => value.includes(keyword)));
}

const handleCatalogListQuestion = async ({ phoneNumber, messageText }) => {
    if(!hasServicesListIntent(messageText)) return false;

    const category = await ServicesRepository.findCategoryByMessage(messageText);
    if(category) {
        return CatalogMenu.sendServicesByCategory(phoneNumber, category.nombre);
    }

    return CatalogMenu.sendCategoryList(phoneNumber);
}

const handleHybridServicesMessage = async ({ phoneNumber, messageText }) => {
    const ruleIntent = ServiceIntentDetector.detectRuleIntent(messageText);
    const directService = await ServicesRepository.findServiceByName(messageText);

    const handledByCatalogPayload = await CatalogMenu.handlePayload(phoneNumber, messageText);
    if(handledByCatalogPayload) return { handledBy: 'catalog-menu-payload' };

    if(ruleIntent.intent === INTENTS.AGENDAR_CITA) {
        await FlujoCitas.iniciar(phoneNumber, messageText);
        return { handledBy: 'appointment-flow' };
    }

    if(isRecommendationOrDoubtRequest(messageText)) {
        await sendAiRecommendationWithActions({
            phoneNumber,
            messageText,
            service: directService
        });
        return { handledBy: 'ai-recommendation-or-doubt' };
    }

    if(ruleIntent.intent === INTENTS.PROMOCIONES) {
        await handlePromotions({ phoneNumber, messageText });
        return { handledBy: 'promotions-template' };
    }

    if(ruleIntent.intent === INTENTS.FAQ) {
        const handled = await handleFaq({ phoneNumber, messageText });
        if(handled) return { handledBy: 'faq-template' };
    }

    if(directService) {
        await sendServiceTemplate(phoneNumber, directService, ruleIntent.dato_solicitado || DATA_FIELDS.GENERAL);
        return { handledBy: 'service-template' };
    }

    const handledByCatalogList = await handleCatalogListQuestion({ phoneNumber, messageText });
    if(handledByCatalogList) return { handledBy: 'catalog-list-template' };

    const detectedIntent = await ServiceIntentDetector.detectIntent(messageText);

    if(detectedIntent.intent === INTENTS.AGENDAR_CITA) {
        await FlujoCitas.iniciar(phoneNumber, messageText);
        return { handledBy: `appointment-flow-${detectedIntent.provider}` };
    }

    if(detectedIntent.intent === INTENTS.CONSULTAR_SERVICIO) {
        const handled = await handleServiceConsultation({ phoneNumber, messageText, intent: detectedIntent });
        if(handled) return { handledBy: `service-template-${detectedIntent.provider}` };
    }

    if(detectedIntent.intent === INTENTS.RECOMENDAR_SERVICIO) {
        const handled = await handleRecommendation({ phoneNumber, messageText, intent: detectedIntent });
        if(handled) return { handledBy: `recommendation-ai-${detectedIntent.provider}` };
    }

    if(detectedIntent.intent === INTENTS.PROMOCIONES) {
        await handlePromotions({ phoneNumber, messageText });
        return { handledBy: `promotions-template-${detectedIntent.provider}` };
    }

    if(detectedIntent.intent === INTENTS.FAQ) {
        const handled = await handleFaq({ phoneNumber, messageText });
        if(handled) return { handledBy: `faq-template-${detectedIntent.provider}` };
    }

    return null;
}

const recordIncomingMessage = async ({ phoneNumber, name, messageText, messageId, type }) => {
    const originalMessage = messageText;
    const clientResult = await clientModel.verifyStoreClient(
        phoneNumber,
        name,
        messageText,
        { returnAttribution: true }
    );
    messageText = clientResult?.cleanMessage || messageText;

    const storedMessage = await ChatStore.addMessage({
        phoneNumber,
        name,
        direction: 'in',
        type,
        text: originalMessage,
        messageId,
        metadata: clientResult?.attribution ? {
            campaignAttribution: clientResult.attribution
        } : {}
    });

    await CustomerProfile.rememberName(phoneNumber, name, 'whatsapp');
    await CustomerProfile.rememberFromMessage(phoneNumber, messageText);

    return {
        phoneNumber,
        name,
        messageText,
        originalMessage,
        messageId,
        type,
        createdAt: storedMessage?.createdAt || new Date().toISOString(),
        clientResult
    };
}

const respondToIncomingMessageInternal = async ({ phoneNumber, messageText, messageId }) => {
    const formatMessage = messageText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const commandMessage = formatMessage.replace(/[^a-z0-9_ ]+/g, '').replace(/\s+/g, ' ').trim();

    const control = await ConversationControlStore.getControl(phoneNumber);
    if(control?.mode === 'human') {
        ChatStore.setAlert(phoneNumber, {
            type: 'human_control',
            severity: 'info',
            title: 'Control humano activo',
            message: 'El bot esta pausado. Responde desde el dashboard.'
        });
        return { handledBy: 'human-control' };
    }

    if(control?.mode === 'assisted_flow') {
        const handledByAppointment = await FlujoCitas.continuar(phoneNumber, messageText);
        if(handledByAppointment) return { handledBy: 'assisted-appointment-flow' };

        await ConversationControlStore.returnToHuman(phoneNumber);
        ChatStore.broadcastControl(phoneNumber, await ConversationControlStore.getControl(phoneNumber));
        ChatStore.setAlert(phoneNumber, {
            type: 'human_control',
            severity: 'info',
            title: 'Control humano activo',
            message: 'El flujo asistido no pudo continuar automaticamente. Responde desde el dashboard.'
        });
        return { handledBy: 'assisted-flow-fallback-human' };
    }

    let activeTool = await getActiveTool(phoneNumber, formatMessage);
    console.log('activeTool', activeTool);

    const isMenuCommand = formatMessage === 'menu' || formatMessage.startsWith('menu_');
    const isGreetingCommand = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'inicio', 'ayuda'].includes(formatMessage);
    const isServiceButton = formatMessage.startsWith('service_');
    const isCatalogButton = isServiceButton || formatMessage.startsWith('category_');
    const isServicesMenuRequest = [
        'menu_services',
        'servicios',
        'ver servicios',
        'catalogo',
        'catalogo de servicios',
        'tratamientos'
    ].includes(commandMessage);
    const shouldCheckAppointmentFirst = formatMessage !== 'menu' && !isCatalogButton;
    
    if(isMenuCommand || isGreetingCommand || isServicesMenuRequest) {
        if(activeTool) {
            await StateStore.del(`${phoneNumber}:tool`);
            activeTool = null;
        }
        await FlujoCitas.reiniciar(phoneNumber);
    }

    if(isServicesMenuRequest) {
        await StateStore.del(`${phoneNumber}:steps`);
        await StateManager.clearState(phoneNumber);
        await CatalogMenu.sendCategoryList(phoneNumber);
        return { handledBy: 'catalog-menu-direct' };
    }

    const activeState = await StateManager.getActiveState(phoneNumber);

    if(activeState?.intent === 'registro_promociones') {
        const PromoFlow = require('./citas/promoFlow');
        const handledByPromo = await PromoFlow.continuar(phoneNumber, messageText);
        if(handledByPromo) return { handledBy: 'promo-registration-flow' };
    }

    if(activeState?.intent === FlujoCitas.INTENCION_CITA && shouldCheckAppointmentFirst) {
        const handledByState = await FlujoCitas.continuar(phoneNumber, messageText);
        if(handledByState) return { handledBy: 'conversation-state' };
    }

    if(GestionCitas.isManagementPayload(messageText)) {
        const handledExpiredManagementAction = await GestionCitas.handleExpiredAction(phoneNumber, messageText);
        if(handledExpiredManagementAction) return { handledBy: 'expired-appointment-management-action' };
    }

    if(shouldCheckAppointmentFirst && GestionCitas.isManagementIntent(messageText)) {
        const handledByAppointmentManagement = await FlujoCitas.iniciarGestion(phoneNumber);
        if(handledByAppointmentManagement) return { handledBy: 'appointment-management' };
    }

    const handledByServiceFollowup = await ServiceFollowup.handleMessage({
        phoneNumber,
        messageText,
        activeState,
        isAffirmative,
        hasScheduleDetails,
        isNegative
    });
    if(handledByServiceFollowup) {
        if(handledByServiceFollowup.action === 'start_appointment' && handledByServiceFollowup.service?.id) {
            await FlujoCitas.iniciarConServicio(phoneNumber, handledByServiceFollowup.service, messageText);
        }
        return { handledBy: handledByServiceFollowup.handledBy };
    }

    const prioritizeServiceIntent = !isCatalogButton && formatMessage !== 'menu' && shouldPrioritizeServiceIntent(messageText);

    if(prioritizeServiceIntent) {
        const handledByHybridServices = await handleHybridServicesMessage({ phoneNumber, messageText });
        if(handledByHybridServices) return handledByHybridServices;
    }

    if(!isCatalogButton && !prioritizeServiceIntent) {
        const handledByFlow = await GuidedFlowRunner.sendMessageSteps(formatMessage, phoneNumber, messageId);
        if(handledByFlow) return { handledBy: 'guided-flow' };
    }

    const handledByAppointment = shouldCheckAppointmentFirst
        ? await FlujoCitas.continuar(phoneNumber, messageText)
        : false;

    if(handledByAppointment) return { handledBy: 'appointment' };

    if(formatMessage !== 'menu') {
        const handledByHybridServices = await handleHybridServicesMessage({ phoneNumber, messageText });
        if(handledByHybridServices) return handledByHybridServices;
    }

    if(isCatalogButton) {
        const handledByHybridServices = await handleHybridServicesMessage({ phoneNumber, messageText });
        if(handledByHybridServices) return handledByHybridServices;
    }



    if(activeTool === 'chatgpt') {
        await Chatgpt.chatgpt(messageText, phoneNumber, messageId);
        return { handledBy: 'chatgpt' };
    }

    if(activeTool === 'gemini') {
        await Gemini.geminiProccess(messageText, phoneNumber);
        return { handledBy: 'gemini' };
    }

    const handledByGuidedResponse = await GuidedResponses.handleGuidedResponse(phoneNumber, messageText);
    if(handledByGuidedResponse) return { handledBy: 'guided-response' };

    await Gemini.geminiProccess(messageText, phoneNumber);
    return { handledBy: 'ai-fallback' };
}

const respondToIncomingMessage = async (payload) => {
    try {
        return await respondToIncomingMessageInternal(payload);
    } catch (error) {
        if(isCatalogUnavailableError(error)) {
            console.error('Service catalog unavailable:', error.cause?.message || error.message);
            await Messages.sendTextMessage(ServicesRepository.CATALOG_UNAVAILABLE_MESSAGE, payload.phoneNumber, { source: 'bot' });
            return { handledBy: 'service-catalog-unavailable' };
        }

        throw error;
    }
}

const isCatalogUnavailableError = (error) => error?.code === 'SERVICE_CATALOG_UNAVAILABLE' ||
    error instanceof ServicesRepository.ServiceCatalogUnavailableError;

const processIncomingMessage = async (payload) => {
    try {
        const recorded = await recordIncomingMessage(payload);
        return await respondToIncomingMessage(recorded);
    } catch (error) {
        if(isCatalogUnavailableError(error)) {
            console.error('Service catalog unavailable:', error.cause?.message || error.message);
            await Messages.sendTextMessage(ServicesRepository.CATALOG_UNAVAILABLE_MESSAGE, payload.phoneNumber, { source: 'bot' });
            return { handledBy: 'service-catalog-unavailable' };
        }

        throw error;
    }
}

module.exports = {
    processIncomingMessage,
    recordIncomingMessage,
    respondToIncomingMessage,
    shouldPrioritizeServiceIntent,
    isRecommendationOrDoubtRequest
};
