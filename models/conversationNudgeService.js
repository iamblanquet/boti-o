const StateStore = require('./stateStore');
const Messages = require('./messages');
const ResponseGuard = require('../utils/responseGuard');
const { getMessage } = require('../utils/systemMessageLoader');

const NUDGE_DELAY_MS = Number(process.env.CONVERSATION_NUDGE_DELAY_MS || 2 * 60 * 1000);
const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;
const NUDGE_TTL_SECONDS = 26 * 60 * 60;
const DEFAULT_CHECK_INTERVAL_MS = 60 * 1000;
const timers = new Map();
const sending = new Set();
let scheduler = null;

const key = (phoneNumber) => `${phoneNumber}:conversation_nudge`;
const customerKey = (phoneNumber) => `${phoneNumber}:last_customer_message_at`;
const pendingIndexKey = 'conversation_nudge:pending';

const getCheckIntervalMs = () => {
    const configured = Number(process.env.CONVERSATION_NUDGE_CHECK_INTERVAL_MS);
    return Number.isFinite(configured) && configured >= 10000 ? configured : DEFAULT_CHECK_INTERVAL_MS;
};

const getPendingIndex = async () => {
    const raw = await StateStore.get(pendingIndexKey);
    if(!raw) return {};
    try { return JSON.parse(raw) || {}; } catch (_) { return {}; }
};

const savePendingIndex = (entries) => StateStore.set(pendingIndexKey, JSON.stringify(entries), NUDGE_TTL_SECONDS);

const addPending = async (phoneNumber, dueAt) => {
    const entries = await getPendingIndex();
    entries[phoneNumber] = dueAt;
    await savePendingIndex(entries);
};

const removePending = async (phoneNumber) => {
    const entries = await getPendingIndex();
    if(!entries[phoneNumber]) return;
    delete entries[phoneNumber];
    await savePendingIndex(entries);
};

const clearTimer = (phoneNumber) => {
    const timer = timers.get(phoneNumber);
    if(timer) clearTimeout(timer);
    timers.delete(phoneNumber);
};

const arm = (phoneNumber, dueAt) => {
    clearTimer(phoneNumber);
    const waitMs = Math.max(0, new Date(dueAt).getTime() - Date.now());
    const timer = setTimeout(() => {
        timers.delete(phoneNumber);
        // A delayed nudge must not inherit the stale-response token that scheduled it.
        ResponseGuard.run(null, () => sendDueNudge(phoneNumber))
            .catch((error) => console.log('No se pudo enviar seguimiento conversacional:', error.message));
    }, waitMs);
    timers.set(phoneNumber, timer);
};

const isQuestion = (text) => /[?¿]/.test(String(text || ''));
const getInteractiveIds = (payload) => [
    ...(payload?.action?.buttons || []).map((button) => button.reply?.id),
    ...(payload?.action?.sections || []).flatMap((section) => (section.rows || []).map((row) => row.id))
].filter(Boolean);
const isClosingAppointmentAction = (payload) => getInteractiveIds(payload).some((id) => (
    /^(appt_confirm_|appt_cancel_|appt_manage_|svc_offer_|svc_obj_)/.test(String(id))
));
const isWaitingForReply = ({ type, text, buttonPayload, listPayload, source }) => {
    if(source === 'human' || source === 'nudge') return false;
    if(['button', 'list'].includes(type) && (buttonPayload || listPayload)) return true;
    return type === 'text' && isQuestion(text);
};

const cancel = async (phoneNumber) => {
    clearTimer(phoneNumber);
    await removePending(phoneNumber);
    return StateStore.del(key(phoneNumber));
};

const recordCustomerMessage = async (phoneNumber, createdAt = new Date().toISOString()) => {
    await cancel(phoneNumber);
    await StateStore.set(customerKey(phoneNumber), createdAt, NUDGE_TTL_SECONDS);
};

const schedule = async ({ phoneNumber, text, type, buttonPayload, listPayload, source, customerMessageAt }) => {
    if(!phoneNumber || !isWaitingForReply({ type, text, buttonPayload, listPayload, source })) return null;
    const now = Date.now();
    const rememberedAt = customerMessageAt || await StateStore.get(customerKey(phoneNumber));
    const customerAt = new Date(rememberedAt || now).getTime();
    if(!Number.isFinite(customerAt) || now - customerAt > CUSTOMER_WINDOW_MS) return null;

    const entry = {
        phoneNumber,
        prompt: String(text || buttonPayload?.body?.text || listPayload?.body?.text || '').trim(),
        replyType: ['button', 'list'].includes(type) ? type : null,
        resendInteractive: !isClosingAppointmentAction(buttonPayload || listPayload),
        interactivePayload: ['button', 'list'].includes(type) ? (buttonPayload || listPayload || null) : null,
        customerMessageAt: new Date(customerAt).toISOString(),
        dueAt: new Date(now + NUDGE_DELAY_MS).toISOString()
    };
    await StateStore.set(key(phoneNumber), JSON.stringify(entry), NUDGE_TTL_SECONDS);
    await addPending(phoneNumber, entry.dueAt);
    arm(phoneNumber, entry.dueAt);
    console.log('Empujon conversacional programado', { phoneNumber, dueAt: entry.dueAt, type });
    return entry;
};

const get = async (phoneNumber) => {
    const raw = await StateStore.get(key(phoneNumber));
    if(!raw) return null;
    try { return JSON.parse(raw); } catch (_) { await cancel(phoneNumber); return null; }
};

const resumeAppointmentFlow = async (phoneNumber) => {
    const { getFlow } = require('./citas/almacenamiento');
    const { askForField } = require('./citas/preguntas');
    const flow = await getFlow(phoneNumber);
    if(!flow?.waitingFor || !['service', 'date', 'time', 'people', 'participantNames', 'name'].includes(flow.waitingFor)) return false;
    await askForField(phoneNumber, flow.waitingFor, flow.data || {});
    return true;
};

const isAppointmentPayload = (payload) => {
    const buttons = payload?.action?.buttons || [];
    const rows = payload?.action?.sections?.flatMap((section) => section.rows || []) || [];
    return [...buttons, ...rows].some((item) => String(item?.reply?.id || item?.id || '').startsWith('appt_'));
};

const buildNudgeInteractivePayload = (payload) => {
    const nextPayload = JSON.parse(JSON.stringify(payload));
    if(nextPayload?.body) {
        nextPayload.body.text = '¿Te gustaría continuar? Elige una opción:';
    }
    return nextPayload;
};

const sendDueNudge = async (phoneNumber, now = new Date()) => {
    if(sending.has(phoneNumber)) return false;
    sending.add(phoneNumber);
    try {
        const entry = await get(phoneNumber);
        if(!entry || new Date(entry.dueAt) > now) return false;
        if(now.getTime() - new Date(entry.customerMessageAt).getTime() > CUSTOMER_WINDOW_MS) {
            await cancel(phoneNumber);
            return false;
        }

        const lastCustomerMessageAt = await StateStore.get(customerKey(phoneNumber));
        if(lastCustomerMessageAt && new Date(lastCustomerMessageAt) > new Date(entry.customerMessageAt)) {
            await cancel(phoneNumber);
            return false;
        }

        const result = await ResponseGuard.run(null, async () => {
            if(entry.resendInteractive && isAppointmentPayload(entry.interactivePayload)) {
                const resumed = await resumeAppointmentFlow(phoneNumber);
                if(resumed) return true;
            }

            if(entry.resendInteractive && entry.replyType && entry.interactivePayload) {
                await Messages.sendMessage({
                    text: '',
                    phoneNumber,
                    type: entry.replyType,
                    [entry.replyType === 'button' ? 'buttonPayload' : 'listPayload']: buildNudgeInteractivePayload(entry.interactivePayload),
                    source: 'nudge',
                    personalize: false
                });
                return true;
            }

            return Messages.sendTextMessage(getMessage('conversation_nudge', {
                prompt: entry.prompt || 'tu respuesta'
            }), phoneNumber, { source: 'nudge', personalize: false });
        });

        if(result) {
            await cancel(phoneNumber);
            console.log('Empujon conversacional enviado', { phoneNumber });
        }
        return Boolean(result);
    } finally {
        sending.delete(phoneNumber);
    }
};

const checkDueNudges = async (now = new Date()) => {
    const entries = await getPendingIndex();
    for(const [phoneNumber, dueAt] of Object.entries(entries)) {
        if(new Date(dueAt) > now) continue;
        await ResponseGuard.run(null, () => sendDueNudge(phoneNumber, now));
    }
};

const startConversationNudgeScheduler = () => {
    if(scheduler) return scheduler;
    checkDueNudges().catch((error) => console.log('No se pudieron recuperar seguimientos conversacionales:', error.message));
    scheduler = setInterval(() => {
        checkDueNudges().catch((error) => console.log('No se pudieron revisar seguimientos conversacionales:', error.message));
    }, getCheckIntervalMs());
    return scheduler;
};

module.exports = {
    schedule,
    cancel,
    get,
    sendDueNudge,
    startConversationNudgeScheduler,
    recordCustomerMessage,
    isWaitingForReply,
    key
};
