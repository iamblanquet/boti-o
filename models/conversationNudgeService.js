const StateStore = require('./stateStore');
const Messages = require('./messages');
const { getMessage } = require('../utils/systemMessageLoader');

const NUDGE_DELAY_MS = Number(process.env.CONVERSATION_NUDGE_DELAY_MS || 10 * 60 * 1000);
const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;
const NUDGE_TTL_SECONDS = 26 * 60 * 60;
const timers = new Map();

const key = (phoneNumber) => `${phoneNumber}:conversation_nudge`;
const customerKey = (phoneNumber) => `${phoneNumber}:last_customer_message_at`;
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
        sendDueNudge(phoneNumber).catch((error) => console.log('No se pudo enviar seguimiento conversacional:', error.message));
    }, waitMs);
    timer.unref?.();
    timers.set(phoneNumber, timer);
};
const isQuestion = (text) => /[?¿]/.test(String(text || ''));
const isWaitingForReply = ({ type, text, buttonPayload, listPayload, source }) => {
    if(source === 'human' || source === 'nudge') return false;
    if(['button', 'list'].includes(type) && (buttonPayload || listPayload)) return true;
    return type === 'text' && isQuestion(text);
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
        interactivePayload: ['button', 'list'].includes(type)
            ? (buttonPayload || listPayload || null)
            : null,
        customerMessageAt: new Date(customerAt).toISOString(),
        dueAt: new Date(now + NUDGE_DELAY_MS).toISOString(),
        sentAt: null
    };
    await StateStore.set(key(phoneNumber), JSON.stringify(entry), NUDGE_TTL_SECONDS);
    arm(phoneNumber, entry.dueAt);
    return entry;
};

const cancel = async (phoneNumber) => {
    clearTimer(phoneNumber);
    return StateStore.del(key(phoneNumber));
};

const get = async (phoneNumber) => {
    const raw = await StateStore.get(key(phoneNumber));
    if(!raw) return null;
    try { return JSON.parse(raw); } catch (_) { await cancel(phoneNumber); return null; }
};

const sendDueNudge = async (phoneNumber, now = new Date()) => {
    const entry = await get(phoneNumber);
    if(!entry || entry.sentAt || new Date(entry.dueAt) > now) return false;
    if(now.getTime() - new Date(entry.customerMessageAt).getTime() > CUSTOMER_WINDOW_MS) {
        await cancel(phoneNumber);
        return false;
    }
    const result = await Messages.sendTextMessage(getMessage('conversation_nudge', {
        prompt: entry.prompt || 'tu respuesta'
    }), phoneNumber, {
        source: 'nudge', personalize: false
    });
    if(result && entry.replyType && entry.interactivePayload) {
        await Messages.sendMessage({
            text: '',
            phoneNumber,
            type: entry.replyType,
            [entry.replyType === 'button' ? 'buttonPayload' : 'listPayload']: entry.interactivePayload,
            source: 'nudge',
            personalize: false
        });
    }
    if(result) {
        await StateStore.set(key(phoneNumber), JSON.stringify({ ...entry, sentAt: now.toISOString() }), NUDGE_TTL_SECONDS);
    }
    return Boolean(result);
};

module.exports = { schedule, cancel, get, sendDueNudge, recordCustomerMessage, isWaitingForReply, key };
