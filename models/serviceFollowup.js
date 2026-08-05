const fs = require('fs');
const path = require('path');
const Messages = require('./messages');
const ChatStore = require('./chatStore');
const StateManager = require('./conversationStateManager');
const ServicesRepository = require('./servicesRepository');
const ResponseTemplates = require('./responseTemplates');
const { sendButtonGroups, truncateListText } = require('./citas/mensajesWhatsapp');
const { findAvailableDaysThisWeek } = require('./citas/disponibilidad');
const { formatDayButtonTitle, getServiceLabel } = require('./citas/formato');
const { saveFlow } = require('./citas/almacenamiento');
const { FLOW_MODE_CREATE } = require('./citas/reglas');

const SERVICE_FOLLOWUP_INTENT = 'service_followup';
const STEP_ASK_AGENDA = 'ask_agenda';
const STEP_OBJECTION_REASON = 'objection_reason';
const DATA_DIR = path.join(__dirname, '..', 'data');
const PENDING_FILE = path.join(DATA_DIR, 'service_followups.json');
const DEFAULT_REMINDER_DELAY_MS = 2 * 60 * 60 * 1000;
const DEFAULT_REMINDER_INTERVAL_MS = 60 * 1000;

const OBJECTION_REASONS = {
    PRICE: 'svc_obj_price',
    THINKING: 'svc_obj_thinking',
    SCHEDULE: 'svc_obj_schedule',
    COMPARING: 'svc_obj_comparing'
};

const OFFER_ACTIONS = {
    APPOINTMENT: 'svc_offer_agendar',
    DECLINE: 'svc_offer_no'
};

const buildOfferActionPayload = (action, serviceId) => `${action}:${serviceId}`;

const parseOfferActionPayload = (message) => {
    const value = String(message || '');
    const legacyAction = Object.values(OFFER_ACTIONS).find((action) => action === value);
    if(legacyAction) return { action: legacyAction, serviceId: null };

    const separatorIndex = value.indexOf(':');
    if(separatorIndex < 0) return null;

    const action = value.slice(0, separatorIndex);
    const serviceId = value.slice(separatorIndex + 1).trim();
    if(!Object.values(OFFER_ACTIONS).includes(action) || !serviceId) return null;
    return { action, serviceId };
};

let timer = null;
let running = false;

const normalizeMessage = (message) => String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const getReminderDelayMs = () => {
    const configured = Number(process.env.SERVICE_FOLLOWUP_REMINDER_DELAY_MS);
    return Number.isFinite(configured) && configured >= 60000
        ? configured
        : DEFAULT_REMINDER_DELAY_MS;
};

const getReminderIntervalMs = () => {
    const configured = Number(process.env.SERVICE_FOLLOWUP_REMINDER_INTERVAL_MS);
    return Number.isFinite(configured) && configured >= 10000
        ? configured
        : DEFAULT_REMINDER_INTERVAL_MS;
};

const readPending = () => {
    try {
        if(!fs.existsSync(PENDING_FILE)) return {};
        return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')) || {};
    } catch (error) {
        console.log('No se pudo leer seguimiento de servicios.', error.message);
        return {};
    }
};

const writePending = (pending) => {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
    } catch (error) {
        console.log('No se pudo guardar seguimiento de servicios.', error.message);
    }
};

const toFollowupService = (service = {}) => ({
    id: service.id,
    nombre: service.nombre || service.name,
    duracionMinutos: service.duracionMinutos || service.durationMinutes,
    precio: service.precio,
    preciosPersonas: service.preciosPersonas || service.personPrices || []
});

const savePendingOffer = (phoneNumber, service) => {
    if(!phoneNumber || !service?.id) return null;

    const now = new Date();
    const pending = readPending();
    pending[phoneNumber] = {
        phoneNumber,
        service: toFollowupService(service),
        status: 'awaiting_response',
        offeredAt: now.toISOString(),
        reminderDueAt: new Date(now.getTime() + getReminderDelayMs()).toISOString(),
        reminderSentAt: null,
        updatedAt: now.toISOString()
    };
    writePending(pending);
    return pending[phoneNumber];
};

const updatePending = (phoneNumber, patch = {}) => {
    const pending = readPending();
    if(!pending[phoneNumber]) return null;

    pending[phoneNumber] = {
        ...pending[phoneNumber],
        ...patch,
        updatedAt: new Date().toISOString()
    };
    writePending(pending);
    return pending[phoneNumber];
};

const resolvePending = (phoneNumber, status = 'responded') => updatePending(phoneNumber, { status });

const getPendingOffer = (phoneNumber) => {
    const entry = readPending()[phoneNumber];
    if(!entry || !['awaiting_response', 'reminded', 'objection_asked'].includes(entry.status)) return null;
    return entry;
};

const getServiceFromRecentConversation = async (phoneNumber) => {
    try {
        const messages = await ChatStore.getMessagesAsync(phoneNumber);
        const recentOutbounds = (messages || [])
            .filter((message) => message.direction === 'out' && message.text)
            .slice(-10)
            .reverse();

        for(const message of recentOutbounds) {
            const exactMatch = String(message.text).match(/Te cuento,\s*([^:]+):/i);
            const serviceName = exactMatch?.[1];
            if(serviceName) {
                const service = await ServicesRepository.findServiceByName(serviceName);
                if(service) return service;
            }
        }
    } catch (error) {
        console.log('No se pudo detectar servicio reciente para seguimiento.', error.message);
    }

    return null;
};

const getFollowupService = async (phoneNumber, activeState) => {
    if(activeState?.data?.service?.id) return activeState.data.service;

    const pending = getPendingOffer(phoneNumber);
    if(pending?.service?.id) return pending.service;

    const recentService = await getServiceFromRecentConversation(phoneNumber);
    if(recentService?.id) {
        savePendingOffer(phoneNumber, recentService);
        return toFollowupService(recentService);
    }

    return null;
};

const getContextService = async (phoneNumber, activeState = null) => {
    const service = await getFollowupService(phoneNumber, activeState);
    if(!service?.id) return null;

    const fullService = await ServicesRepository.getServiceById(service.id);
    return fullService || service;
};

const saveOfferState = async (phoneNumber, service) => {
    const followupService = toFollowupService(service);
    await StateManager.saveState({
        phone: phoneNumber,
        intent: SERVICE_FOLLOWUP_INTENT,
        step: STEP_ASK_AGENDA,
        data: {
            service: followupService
        }
    });
    savePendingOffer(phoneNumber, followupService);
};

const sendOfferDecisionButtons = async (phoneNumber, service) => {
    if(!phoneNumber || !service?.id) return false;

    await saveOfferState(phoneNumber, service);

    return sendButtonGroups(
        phoneNumber,
        '¿Qué te gustaría hacer?',
        [
            { id: buildOfferActionPayload(OFFER_ACTIONS.APPOINTMENT, service.id), title: 'Agendar cita' },
            { id: buildOfferActionPayload(OFFER_ACTIONS.DECLINE, service.id), title: 'No gracias' }
        ]
    );
};

const sendObjectionReasonList = async (phoneNumber, service) => {
    await StateManager.saveState({
        phone: phoneNumber,
        intent: SERVICE_FOLLOWUP_INTENT,
        step: STEP_OBJECTION_REASON,
        data: {
            service: toFollowupService(service),
            objectionAskedAt: new Date().toISOString()
        }
    });
    resolvePending(phoneNumber, 'objection_asked');

    return sendButtonGroups(
        phoneNumber,
        [
            `Claro, entiendo que ${service?.nombre || 'este servicio'} tal vez no sea para este momento.`,
            'Para orientarte mejor, me ayudaria saber que te detuvo por ahora:'
        ].join('\n\n'),
        [
            { id: OBJECTION_REASONS.PRICE, title: 'Precio' },
            { id: OBJECTION_REASONS.THINKING, title: 'Quiero pensarlo' },
            { id: OBJECTION_REASONS.SCHEDULE, title: 'No tengo tiempo' },
            { id: OBJECTION_REASONS.COMPARING, title: 'Comparo opciones' }
        ]
    );
};

const formatPromotionService = (service) => {
    const price = ResponseTemplates.formatPeoplePrices(service);
    const duration = ResponseTemplates.formatDuration(service.duracionMinutos);
    return `- ${service.nombre}${duration ? `, ${duration}` : ''}${price ? `, ${price}` : ''}`;
};

const sendPromotionOffers = async (phoneNumber) => {
    const promotions = await ServicesRepository.listPromotionServices();

    if(promotions.length) {
        await Messages.sendTextMessage([
            'Gracias por contarmelo. Te comparto las ofertas que tenemos cargadas en Promociones:',
            ...promotions.slice(0, 6).map(formatPromotionService),
            '',
            'Si alguna te acomoda, con gusto reviso disponibilidad para ti.'
        ].join('\n'), phoneNumber, { source: 'bot' });
        return true;
    }

    const activePromotions = await ServicesRepository.getActivePromotions();
    await Messages.sendTextMessage(ResponseTemplates.promotions(activePromotions), phoneNumber, { source: 'bot' });
    return true;
};

const sendThinkingMessage = async (phoneNumber) => {
    await Messages.sendTextMessage([
        'Claro, tomarte tu tiempo tambien es parte de elegir bien.',
        'Nuestros testimonios nos avalan y estaremos felices de orientarte cuando quieras retomarlo.'
    ].join('\n\n'), phoneNumber, { source: 'bot' });
    return true;
};

const getNextWeekStart = (now = new Date()) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = date.getDay();
    const daysUntilNextMonday = ((8 - day) % 7) || 7;
    date.setDate(date.getDate() + daysUntilNextMonday);
    return date;
};

const sendNextWeekAvailability = async (phoneNumber, service) => {
    const appointmentData = {
        serviceId: service.id,
        serviceName: service.nombre,
        durationMinutes: service.duracionMinutos
    };
    const days = await findAvailableDaysThisWeek(appointmentData, {
        now: getNextWeekStart(),
        daysToCheck: 7,
        maxResults: 6
    });

    if(!days.length) {
        await Messages.sendTextMessage([
            `Entiendo. Para ${getServiceLabel(appointmentData)} no veo horarios libres la proxima semana en este momento.`,
            'Si me compartes un dia u horario ideal, lo revisamos con el equipo.'
        ].join('\n\n'), phoneNumber, { source: 'bot' });
        return true;
    }

    await saveFlow(phoneNumber, {
        mode: FLOW_MODE_CREATE,
        data: appointmentData,
        waitingFor: 'date'
    });

    await sendButtonGroups(
        phoneNumber,
        `Claro, busquemos algo que se ajuste mejor. Para ${getServiceLabel(appointmentData)} tengo estas opciones la proxima semana:`,
        days.map((day) => ({
            id: `appt_date_${day.date}`,
            title: truncateListText(day.title || formatDayButtonTitle(day.date), 20)
        }))
    );
    return true;
};

const sendComparingMessage = async (phoneNumber, service) => {
    await Messages.sendTextMessage([
        'Totalmente valido comparar opciones.',
        `En Thessa cuidamos que ${service?.nombre || 'cada servicio'} tenga una valoracion y seguimiento cercano para que elijas con confianza. Si quieres, te ayudo a resolver dudas puntuales.`
    ].join('\n\n'), phoneNumber, { source: 'bot' });
    return true;
};

const handleObjectionReason = async (phoneNumber, reasonId, service) => {
    resolvePending(phoneNumber, `reason_${reasonId}`);
    await StateManager.clearState(phoneNumber);

    if(reasonId === OBJECTION_REASONS.PRICE) return sendPromotionOffers(phoneNumber);
    if(reasonId === OBJECTION_REASONS.THINKING) return sendThinkingMessage(phoneNumber);
    if(reasonId === OBJECTION_REASONS.SCHEDULE) return sendNextWeekAvailability(phoneNumber, service);
    if(reasonId === OBJECTION_REASONS.COMPARING) return sendComparingMessage(phoneNumber, service);

    return false;
};

const isObjectionReasonPayload = (message) => Object.values(OBJECTION_REASONS).includes(String(message || ''));
const getReasonFromText = (message) => {
    const value = normalizeMessage(message);
    if(value.includes('precio') || value.includes('caro') || value.includes('oferta')) return OBJECTION_REASONS.PRICE;
    if(value.includes('pensarlo') || value.includes('pensar') || value.includes('luego')) return OBJECTION_REASONS.THINKING;
    if(value.includes('tiempo') || value.includes('horario') || value.includes('agenda')) return OBJECTION_REASONS.SCHEDULE;
    if(value.includes('compar')) return OBJECTION_REASONS.COMPARING;
    return null;
};

const handleMessage = async ({ phoneNumber, messageText, activeState, isAffirmative, hasScheduleDetails, isNegative }) => {
    const offerAction = parseOfferActionPayload(messageText);
    if(offerAction) {
        const service = offerAction.serviceId
            ? await ServicesRepository.getServiceById(offerAction.serviceId)
            : await getFollowupService(phoneNumber, activeState);
        if(!service?.id) return null;

        if(offerAction.action === OFFER_ACTIONS.APPOINTMENT) {
            resolvePending(phoneNumber, 'appointment_started');
            return {
                handledBy: 'service-followup-appointment',
                action: 'start_appointment',
                service
            };
        }

        if(offerAction.action === OFFER_ACTIONS.DECLINE) {
            await sendObjectionReasonList(phoneNumber, service);
            return { handledBy: 'service-objection-ask' };
        }
    }

    if(isObjectionReasonPayload(messageText)) {
        const service = await getFollowupService(phoneNumber, activeState) || {};
        const handled = await handleObjectionReason(phoneNumber, messageText, service);
        return handled ? { handledBy: 'service-objection-reason' } : null;
    }

    const pendingOffer = getPendingOffer(phoneNumber);
    const hasFollowupContext = activeState?.intent === SERVICE_FOLLOWUP_INTENT || Boolean(pendingOffer);

    if(!hasFollowupContext && !isNegative(messageText)) return null;

    const service = await getFollowupService(phoneNumber, activeState);
    if(!service?.id) return null;

    const effectiveStep = activeState?.step || (pendingOffer?.status === 'objection_asked' ? STEP_OBJECTION_REASON : STEP_ASK_AGENDA);

    if(effectiveStep === STEP_ASK_AGENDA || (!activeState && isNegative(messageText))) {
        if(isAffirmative(messageText) || hasScheduleDetails(messageText)) {
            resolvePending(phoneNumber, 'appointment_started');
            return {
                handledBy: 'service-followup-appointment',
                action: 'start_appointment',
                service
            };
        }

        if(isNegative(messageText)) {
            await sendObjectionReasonList(phoneNumber, service);
            return { handledBy: 'service-objection-ask' };
        }
    }

    if(effectiveStep === STEP_OBJECTION_REASON) {
        const reasonId = getReasonFromText(messageText);
        if(reasonId) {
            await handleObjectionReason(phoneNumber, reasonId, service);
            return { handledBy: 'service-objection-text' };
        }

        await sendObjectionReasonList(phoneNumber, service);
        return { handledBy: 'service-objection-repeat' };
    }

    return null;
};

const checkServiceFollowupReminders = async (now = new Date()) => {
    if(running) return;
    running = true;

    try {
        const pending = readPending();
        for(const entry of Object.values(pending)) {
            if(entry.status !== 'awaiting_response' || entry.reminderSentAt || !entry.reminderDueAt) continue;
            if(new Date(entry.reminderDueAt) > now) continue;

            const activeState = await StateManager.getActiveState(entry.phoneNumber);
            if(activeState?.intent !== SERVICE_FOLLOWUP_INTENT || activeState.step !== STEP_ASK_AGENDA) {
                updatePending(entry.phoneNumber, { status: 'expired' });
                continue;
            }

            const serviceName = entry.service?.nombre || 'el servicio que te intereso';
            await Messages.sendTextMessage([
                `Hola, tu cita para ${serviceName} aun te espera.`,
                'Si te gustaria reservar, puedo ayudarte a encontrar un horario que se acomode a tu semana.'
            ].join('\n\n'), entry.phoneNumber, { source: 'bot', personalize: false });
            updatePending(entry.phoneNumber, {
                reminderSentAt: now.toISOString(),
                status: 'reminded'
            });
        }
    } finally {
        running = false;
    }
};

const startServiceFollowupReminders = () => {
    if(timer) return timer;

    const intervalMs = getReminderIntervalMs();
    checkServiceFollowupReminders().catch((error) => {
        console.error('No se pudo revisar seguimiento de servicios:', error.message);
    });

    timer = setInterval(() => {
        checkServiceFollowupReminders().catch((error) => {
            console.error('No se pudo revisar seguimiento de servicios:', error.message);
        });
    }, intervalMs);

    console.log(`Seguimiento de servicios activo cada ${intervalMs}ms`);
    return timer;
};

const stopServiceFollowupReminders = () => {
    if(!timer) return;
    clearInterval(timer);
    timer = null;
};

module.exports = {
    SERVICE_FOLLOWUP_INTENT,
    STEP_ASK_AGENDA,
    STEP_OBJECTION_REASON,
    OBJECTION_REASONS,
    OFFER_ACTIONS,
    buildOfferActionPayload,
    parseOfferActionPayload,
    saveOfferState,
    sendOfferDecisionButtons,
    getContextService,
    handleMessage,
    startServiceFollowupReminders,
    stopServiceFollowupReminders,
    checkServiceFollowupReminders
};
