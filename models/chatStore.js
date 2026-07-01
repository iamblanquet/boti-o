const conversations = new Map();
const clients = new Set();
const SupabaseStore = require('./supabaseStore');

const MAX_MESSAGES_PER_CHAT = 100;
const DB_READ_TIMEOUT_MS = Number(process.env.DASHBOARD_DB_TIMEOUT_MS || 8000);
const DB_WRITE_RETRIES = Number(process.env.DASHBOARD_DB_WRITE_RETRIES || 3);
const ALLOW_LOCAL_CHAT_FALLBACK = process.env.ALLOW_LOCAL_CHAT_FALLBACK === 'true';

const serialize = (data) => `data: ${JSON.stringify(data)}\n\n`;

const withTimeout = (promise, timeoutMs, fallback) => {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
    ]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createEmptyConversation = (phoneNumber, name = '') => ({
    phoneNumber,
    name,
    messages: [],
    lastMessage: '',
    lastAt: null,
    lastDirection: null,
    incomingCount: 0,
    outgoingCount: 0,
    unread: 0,
    alert: null
});

const getConversation = (phoneNumber, name = '') => {
    if(!conversations.has(phoneNumber)) {
        conversations.set(phoneNumber, createEmptyConversation(phoneNumber, name));
    }

    const conversation = conversations.get(phoneNumber);
    if(name && !conversation.name) conversation.name = name;
    return conversation;
}

const setAlert = (phoneNumber, alert) => {
    if(!phoneNumber || !alert) return null;

    const conversation = getConversation(phoneNumber);
    const previous = conversation.alert;
    const payload = {
        active: true,
        type: alert.type || 'attention_required',
        severity: alert.severity || 'warning',
        title: alert.title || 'Atencion requerida',
        message: alert.message || '',
        createdAt: alert.createdAt || new Date().toISOString()
    };

    conversation.alert = payload;
    broadcast('alert', {
        conversation: summarizeConversation(conversation),
        alert: payload
    });

    return {
        conversation,
        alert: payload,
        isNew: !previous || previous.type !== payload.type || previous.active === false
    };
}

const clearAlert = (phoneNumber, type = null) => {
    const conversation = conversations.get(phoneNumber);
    if(!conversation || !conversation.alert) return false;
    if(type && conversation.alert.type !== type) return false;

    conversation.alert = null;
    broadcast('alert', {
        conversation: summarizeConversation(conversation),
        alert: null
    });
    return true;
}

const broadcast = (event, payload) => {
    const data = serialize({ event, payload });
    clients.forEach((client) => {
        try {
            client.write(data);
        } catch (error) {
            clients.delete(client);
        }
    });
}

const broadcastControl = (phoneNumber, control) => {
    if(!phoneNumber) return;
    broadcast('control', { phoneNumber, control });
}

const maybeUpdateSummary = (message, conversation) => {
    if(process.env.CHAT_SUMMARY_ENABLED === 'false') return;

    try {
        const ChatSummaryService = require('./chatSummaryService');
        ChatSummaryService.noteMessageAdded({
            message,
            messages: conversation.messages,
            broadcast: (summary) => broadcast('summary', {
                phoneNumber: message.phoneNumber,
                summary
            })
        }).catch((error) => {
            console.log('No se pudo actualizar resumen IA:', error.message);
        });
    } catch (error) {
        console.log('No se pudo iniciar resumen IA:', error.message);
    }
}

const persistConversationMessage = async (conversation, message) => {
    if(!SupabaseStore.isEnabled()) {
        const error = new Error('Supabase no esta configurado. No se guardo el mensaje.');
        error.code = 'CHAT_PERSISTENCE_UNAVAILABLE';
        throw error;
    }

    let lastError = null;
    for(let attempt = 1; attempt <= DB_WRITE_RETRIES; attempt += 1) {
        try {
            await SupabaseStore.upsertConversation(conversation);
            await SupabaseStore.insertMessage(message);
            return true;
        } catch (error) {
            lastError = error;
            console.log(`No se pudo guardar mensaje en Supabase intento ${attempt}/${DB_WRITE_RETRIES}:`, error.message);
            if(attempt < DB_WRITE_RETRIES) await sleep(250 * attempt);
        }
    }

    setAlert(message.phoneNumber, {
        type: 'supabase_message_persistence',
        severity: 'critical',
        title: 'Mensaje no guardado en Supabase',
        message: 'El mensaje se recibio, pero no se pudo persistir en Supabase. Revisa la conexion o el schema.'
    });
    if(lastError) lastError.code = lastError.code || 'CHAT_PERSISTENCE_FAILED';
    throw lastError;
}

const buildNextConversation = (current, message, name = '') => {
    const base = current
        ? {
            ...current,
            messages: [...(current.messages || [])]
        }
        : createEmptyConversation(message.phoneNumber, name);

    if(name && !base.name) base.name = name;
    base.messages.push(message);
    if(base.messages.length > MAX_MESSAGES_PER_CHAT) base.messages.shift();
    base.lastMessage = message.text;
    base.lastAt = message.createdAt;
    base.lastDirection = message.direction;
    if(message.direction === 'in') {
        base.incomingCount = (base.incomingCount || 0) + 1;
        base.unread = (base.unread || 0) + 1;
    }
    if(message.direction === 'out') base.outgoingCount = (base.outgoingCount || 0) + 1;
    return base;
}

const addMessage = async ({
    phoneNumber,
    name = '',
    direction,
    type = 'text',
    text = '',
    messageId = null,
    source = null,
    metadata = {}
}) => {
    if(!phoneNumber || (!text && type === 'text')) return null;

    const currentConversation = conversations.get(phoneNumber) || null;
    const message = {
        id: messageId || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        phoneNumber,
        direction,
        source: source || (direction === 'in' ? 'client' : 'bot'),
        type,
        text,
        metadata,
        createdAt: new Date().toISOString()
    };

    const conversation = buildNextConversation(currentConversation, message, name);
    await persistConversationMessage(conversation, message);
    conversations.set(phoneNumber, conversation);

    broadcast('message', {
        conversation: summarizeConversation(conversation),
        message
    });

    maybeUpdateSummary(message, conversation);

    return message;
}

const summarizeConversation = (conversation) => ({
    phoneNumber: conversation.phoneNumber,
    name: conversation.name,
    lastMessage: conversation.lastMessage,
    lastAt: conversation.lastAt,
    lastDirection: conversation.lastDirection,
    incomingCount: conversation.incomingCount,
    outgoingCount: conversation.outgoingCount,
    messageCount: conversation.messages.length,
    unread: conversation.unread,
    alert: conversation.alert || null
});

const getConversations = () => {
    return Array.from(conversations.values())
        .map(summarizeConversation)
        .sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
}

const getConversationsAsync = async () => {
    if(SupabaseStore.isEnabled()) {
        const conversationsFromDb = await withTimeout(SupabaseStore.getConversations(), DB_READ_TIMEOUT_MS, null);
        if(conversationsFromDb) {
            return conversationsFromDb.map((conversation) => ({
                ...conversation,
                alert: conversations.get(conversation.phoneNumber)?.alert || null
            }));
        }
        if(!ALLOW_LOCAL_CHAT_FALLBACK) throw new Error('No se pudo leer conversaciones desde Supabase.');
    }

    if(!ALLOW_LOCAL_CHAT_FALLBACK) throw new Error('Supabase no esta configurado para leer conversaciones.');
    return getConversations();
}

const getMessages = (phoneNumber) => {
    const conversation = conversations.get(phoneNumber);
    if(!conversation) return [];
    conversation.unread = 0;
    return conversation.messages;
}

const getMessagesAsync = async (phoneNumber) => {
    if(SupabaseStore.isEnabled()) {
        const messagesFromDb = await withTimeout(SupabaseStore.getMessages(phoneNumber), DB_READ_TIMEOUT_MS, null);
        if(messagesFromDb) return messagesFromDb;
        if(!ALLOW_LOCAL_CHAT_FALLBACK) throw new Error('No se pudo leer historial desde Supabase.');
    }

    if(!ALLOW_LOCAL_CHAT_FALLBACK) throw new Error('Supabase no esta configurado para leer historial.');
    return getMessages(phoneNumber);
}

const stream = async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    try {
        res.write(serialize({ event: 'init', payload: { conversations: await getConversationsAsync() } }));
    } catch (error) {
        res.write(serialize({
            event: 'error',
            payload: {
                message: 'No se pudo cargar conversaciones desde Supabase.'
            }
        }));
    }
    clients.add(res);
    req.on('close', () => clients.delete(res));
}

const updateConversationName = (phoneNumber, name) => {
    if(!phoneNumber || !name) return;
    if(conversations.has(phoneNumber)) {
        const conversation = conversations.get(phoneNumber);
        conversation.name = name;
        
        if(SupabaseStore.isEnabled()) {
            SupabaseStore.upsertConversation(conversation).catch(() => null);
        }
        
        broadcast('alert', {
            conversation: summarizeConversation(conversation),
            alert: conversation.alert || null
        });
    }
}

module.exports = {
    addMessage,
    setAlert,
    clearAlert,
    broadcastControl,
    getConversationsAsync,
    getMessagesAsync,
    stream,
    updateConversationName
}
