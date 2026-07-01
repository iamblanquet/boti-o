const ChatSummaryStore = require('./chatSummaryStore');
const { askWithFallback } = require('./gemini');

const DEFAULT_THRESHOLD = Number(process.env.CHAT_SUMMARY_MESSAGE_THRESHOLD || 20);
const MAX_MESSAGES_FOR_PROMPT = Number(process.env.CHAT_SUMMARY_MAX_MESSAGES || 20);
const inProgress = new Set();

const isRelevantMessage = (message) => {
    if(!message) return false;
    if(message.type === 'note' || message.source === 'note' || message.source === 'system') return false;

    const text = String(message.text || '').trim();
    if(!text) return false;
    if(/^https?:\/\/\S+$/i.test(text) || /^\/mediaFiles\//i.test(text)) return false;
    if(/^(menu_|appt_|category_|service_)/i.test(text)) return false;

    return true;
}

const compactText = (value, maxLength = 180) => {
    const text = String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    if(text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

const compactMessages = (messages, limit = MAX_MESSAGES_FOR_PROMPT) => {
    return (messages || [])
        .filter(isRelevantMessage)
        .slice(-limit)
        .map((message) => {
            const role = message.direction === 'in'
                ? 'C'
                : message.source === 'human'
                    ? 'H'
                    : message.source === 'ia'
                        ? 'IA'
                        : 'B';
            return `${role}: ${compactText(message.text)}`;
        });
}

const normalizeArray = (value) => {
    if(Array.isArray(value)) return value.map((item) => compactText(item, 90)).filter(Boolean).slice(0, 5);
    if(typeof value === 'string' && value.trim()) return [compactText(value, 90)];
    return [];
}

const normalizeDetailedArray = (value) => {
    if(Array.isArray(value)) return value.map((item) => compactText(item, 180)).filter(Boolean).slice(0, 5);
    if(typeof value === 'string' && value.trim()) return [compactText(value, 180)];
    return [];
}

const isAppointmentHistoryLine = (value) => {
    const text = String(value || '').toLowerCase();
    return (
        text.includes('cita previa') ||
        text.includes('cita anterior') ||
        text.includes('citas anteriores') ||
        text.includes('historial de citas') ||
        (text.includes('cita') && (text.includes('confirmada') || text.includes('cancelada') || text.includes('pasada')))
    );
}

const parseJson = (value) => {
    const raw = String(value || '').trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1].trim() : raw;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if(start < 0 || end < start) throw new Error('La IA no devolvio JSON valido.');
    return JSON.parse(body.slice(start, end + 1));
}

const normalizeSummary = (payload) => ({
    summary: compactText(payload.summary, 520),
    intent: compactText(payload.intent || 'otro', 40).toLowerCase(),
    sentiment: compactText(payload.sentiment || 'neutral', 40).toLowerCase(),
    nextStep: compactText(payload.nextStep || payload.next_step || payload.monitorSuggestion || '', 220),
    highlights: [],
    customerContext: {}
});

const buildSummaryPrompt = ({ previousSummary, compactedMessages }) => [
    'Actualiza el contexto operativo de este chat para una persona que monitorea conversaciones de WhatsApp.',
    'Usa muy pocos tokens. No inventes datos. Si algo no esta claro, dejalo vacio o como "otro".',
    'No incluyas citas anteriores, citas canceladas o historial de citas pasadas; eso se muestra en otro modulo del dashboard.',
    'No incluyas el nombre del cliente ni datos que ya aparecen en el perfil del dashboard.',
    'Solo menciona citas si el cliente esta intentando agendar, confirmar, reagendar o cancelar algo ahora.',
    'El campo nextStep debe ser una sugerencia concreta para la persona que monitorea, redactada como accion operativa breve.',
    'Devuelve exclusivamente JSON valido con esta forma:',
    '{"summary":"maximo 60 palabras sobre la necesidad actual","intent":"agendar|consultar_servicio|seguimiento|queja|otro","sentiment":"positivo|neutral|confundido|molesto","nextStep":"sugerencia breve para quien monitorea"}',
    '',
    'Resumen anterior:',
    previousSummary?.summary || 'Sin resumen previo.',
    '',
    'Mensajes nuevos compactados:',
    compactedMessages.join('\n') || 'Sin mensajes nuevos relevantes.'
].join('\n');

const buildDetailedContextPrompt = ({ previousSummary, compactedMessages }) => [
    'Genera contexto detallado para una persona que monitorea este chat de WhatsApp.',
    'Debe ayudarle a entender que necesita el cliente y como intervenir con buen criterio.',
    'No incluyas citas anteriores, citas canceladas o historial de citas pasadas; eso ya existe en otro modulo.',
    'No incluyas el nombre del cliente ni datos que ya aparecen en el perfil del dashboard.',
    'Si mencionas una cita, que sea solo porque el cliente esta tratando de agendar, confirmar, reagendar o cancelar algo ahora.',
    'Devuelve exclusivamente JSON valido con esta forma:',
    '{"overview":"resumen amplio de la situacion actual","currentNeed":"que necesita ahora el cliente","usefulContext":["datos utiles actuales, maximo 5"],"suggestedAction":"accion recomendada para quien monitorea","priority":"baja|media|alta"}',
    '',
    'Resumen IA corto actual:',
    previousSummary?.summary || 'Sin resumen previo.',
    previousSummary?.nextStep ? `Sugerencia actual: ${previousSummary.nextStep}` : '',
    '',
    'Mensajes recientes compactados:',
    compactedMessages.join('\n') || 'Sin mensajes relevantes.'
].filter(Boolean).join('\n');

const getRoleLabel = (message) => {
    if(message.direction === 'in') return 'Cliente';
    if(message.source === 'human') return 'Recepcion';
    if(message.source === 'ia') return 'IA';
    return 'Bot';
}

const inferLocalPriority = (messages = []) => {
    const text = messages.map((message) => message.text || '').join(' ').toLowerCase();
    if(/cancel|reagend|queja|molest|problema|urgente|error|fall/i.test(text)) return 'alta';
    if(/cita|agend|confirm|horario|disponible|precio|servicio/i.test(text)) return 'media';
    return 'baja';
}

const buildLocalDetailedContext = ({ previousSummary, messages = [], error }) => {
    const recentMessages = (messages || [])
        .filter(isRelevantMessage)
        .slice(-8);
    const usefulContext = recentMessages
        .map((message) => `${getRoleLabel(message)}: ${compactText(message.text, 150)}`)
        .filter((item) => !isAppointmentHistoryLine(item))
        .slice(-5);
    const lastInbound = [...recentMessages].reverse().find((message) => message.direction === 'in');
    const unavailable = error
        ? 'La IA no estuvo disponible, asi que este contexto se genero con reglas locales a partir del historial reciente.'
        : 'Contexto generado con reglas locales a partir del historial reciente.';

    return {
        overview: compactText(previousSummary?.summary || unavailable, 900),
        currentNeed: compactText(
            lastInbound?.text || previousSummary?.nextStep || 'No hay una necesidad nueva claramente identificada en los mensajes recientes.',
            360
        ),
        usefulContext,
        suggestedAction: compactText(
            previousSummary?.nextStep || 'Revisa los ultimos mensajes del chat y responde manualmente con la informacion disponible.',
            360
        ),
        priority: inferLocalPriority(recentMessages)
    };
}

const normalizeDetailedContext = (payload) => ({
    overview: compactText(payload.overview || payload.summary || '', 900),
    currentNeed: compactText(payload.currentNeed || payload.current_need || '', 360),
    usefulContext: normalizeDetailedArray(payload.usefulContext || payload.useful_context)
        .filter((item) => !isAppointmentHistoryLine(item)),
    suggestedAction: compactText(payload.suggestedAction || payload.suggested_action || '', 360),
    priority: compactText(payload.priority || 'media', 20).toLowerCase()
});

const generateSummary = async (phoneNumber, messages = [], options = {}) => {
    if(!phoneNumber) return null;
    if(inProgress.has(phoneNumber) && !options.force) return ChatSummaryStore.getLatestSummary(phoneNumber);

    const compactedMessages = compactMessages(messages);
    if(!compactedMessages.length) return ChatSummaryStore.getLatestSummary(phoneNumber);

    inProgress.add(phoneNumber);
    try {
        const previousSummary = await ChatSummaryStore.getLatestSummary(phoneNumber);
        const instructions = 'Eres un asistente que resume chats de atencion al cliente en JSON corto y util.';
        const result = await askWithFallback({
            instructions,
            history: [],
            message: buildSummaryPrompt({ previousSummary, compactedMessages })
        });
        const parsed = normalizeSummary(parseJson(result.answer));
        const relevantMessages = (messages || []).filter(isRelevantMessage);
        const lastRelevantMessage = relevantMessages[relevantMessages.length - 1];

        const summary = await ChatSummaryStore.saveSummary(phoneNumber, {
            ...parsed,
            pendingMessageCount: 0,
            status: 'active',
            lastMessageCreatedAt: lastRelevantMessage?.createdAt || previousSummary?.lastMessageCreatedAt || null,
            lastSummarizedAt: new Date().toISOString()
        });

        if(typeof options.broadcast === 'function') options.broadcast(summary);
        return summary;
    } catch (error) {
        console.log('Error generando resumen IA:', error.message);
        const previousSummary = await ChatSummaryStore.getLatestSummary(phoneNumber);
        if(previousSummary) {
            return ChatSummaryStore.saveSummary(phoneNumber, {
                ...previousSummary,
                status: 'error',
                pendingMessageCount: previousSummary.pendingMessageCount || 0
            });
        }
        throw error;
    } finally {
        inProgress.delete(phoneNumber);
    }
}

const noteMessageAdded = async ({ message, messages = [], broadcast }) => {
    if(!isRelevantMessage(message)) return null;

    const summary = await ChatSummaryStore.incrementPending(message.phoneNumber, message.createdAt);
    const threshold = Number(process.env.CHAT_SUMMARY_MESSAGE_THRESHOLD || DEFAULT_THRESHOLD);
    if((summary?.pendingMessageCount || 0) < threshold) return summary;

    return generateSummary(message.phoneNumber, messages, { broadcast });
}

const getSummary = async (phoneNumber) => ChatSummaryStore.getLatestSummary(phoneNumber);

const generateDetailedContext = async (phoneNumber, messages = []) => {
    if(!phoneNumber) return null;

    const compactedMessages = compactMessages(messages, Number(process.env.CHAT_DETAILED_CONTEXT_MAX_MESSAGES || 50));
    if(!compactedMessages.length) {
        const emptyContext = {
            overview: 'No hay mensajes relevantes suficientes para generar contexto detallado.',
            currentNeed: '',
            usefulContext: [],
            suggestedAction: 'Revisa el chat manualmente antes de intervenir.',
            priority: 'media'
        };
        return ChatSummaryStore.saveDetailedContext(phoneNumber, emptyContext);
    }

    const previousSummary = await ChatSummaryStore.getLatestSummary(phoneNumber);
    try {
        const result = await askWithFallback({
            instructions: 'Eres un asistente que crea contexto operativo claro para agentes humanos. Responde solo JSON valido.',
            history: [],
            message: buildDetailedContextPrompt({ previousSummary, compactedMessages })
        });

        const context = normalizeDetailedContext(parseJson(result.answer));
        return ChatSummaryStore.saveDetailedContext(phoneNumber, context);
    } catch (error) {
        console.log('No se pudo generar contexto detallado con IA. Usando contexto local:', error.message);
        const context = buildLocalDetailedContext({ previousSummary, messages, error });
        return ChatSummaryStore.saveDetailedContext(phoneNumber, context);
    }
}

const getDetailedContext = async (phoneNumber, messages = []) => {
    const existing = await ChatSummaryStore.getDetailedContext(phoneNumber);
    if(existing) return existing;
    return generateDetailedContext(phoneNumber, messages);
}

module.exports = {
    getSummary,
    generateSummary,
    generateDetailedContext,
    getDetailedContext,
    noteMessageAdded,
    isRelevantMessage,
    compactMessages,
    buildLocalDetailedContext
};
