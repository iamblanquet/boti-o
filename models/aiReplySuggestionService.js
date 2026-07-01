const ChatSummaryService = require('./chatSummaryService');
const CustomerProfile = require('./customerProfile');
const ServicesRepository = require('./servicesRepository');
const { askWithFallback } = require('./gemini');
const { buildSpaExpertToneInstructions, cleanWhatsappText } = require('./aiResponseStyle');
const { normalizeText } = require('../utils/configCitas');

const MAX_MESSAGES_FOR_PROMPT = Number(process.env.AI_REPLY_SUGGESTION_MAX_MESSAGES || 18);
const MAX_KNOWLEDGE_CHARS = Number(process.env.AI_REPLY_SUGGESTION_KNOWLEDGE_CHARS || 4500);
const MAX_SUGGESTION_CHARS = Number(process.env.AI_REPLY_SUGGESTION_MAX_CHARS || 1200);

const compactText = (value, maxLength = 260) => {
    const text = String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    if(text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

const getMessageRole = (message) => {
    if(message.direction === 'in') return 'Cliente';
    if(message.source === 'human') return 'Recepcion';
    if(message.source === 'ia') return 'IA';
    return 'Bot';
}

const buildConversationTranscript = (messages = []) => (messages || [])
    .filter(ChatSummaryService.isRelevantMessage)
    .slice(-MAX_MESSAGES_FOR_PROMPT)
    .map((message) => `${getMessageRole(message)}: ${compactText(message.text)}`);

const getLastInboundMessage = (messages = []) => [...(messages || [])]
    .reverse()
    .find((message) => message?.direction === 'in' && ChatSummaryService.isRelevantMessage(message));

const scoreKnowledgeBlock = (block, normalizedContext) => {
    const blockWords = normalizeText(block)
        .split(/\s+/)
        .filter((word) => word.length > 4);
    if(!blockWords.length) return 0;
    return blockWords.reduce((score, word) => score + (normalizedContext.includes(word) ? 1 : 0), 0);
}

const buildKnowledgeSnapshot = async ({ messages, summary }) => {
    try {
        const knowledgeBase = await ServicesRepository.buildKnowledgeBase();
        const normalizedContext = normalizeText([
            summary?.summary,
            summary?.nextStep,
            ...(messages || []).slice(-MAX_MESSAGES_FOR_PROMPT).map((message) => message.text)
        ].filter(Boolean).join(' '));

        const blocks = String(knowledgeBase || '')
            .split(/\n\s*\n/)
            .map((block) => block.trim())
            .filter(Boolean);

        const header = blocks.find((block) => /^thessa/i.test(block)) || 'Thessa - base de conocimiento';
        const ranked = blocks
            .filter((block) => /^P:/i.test(block))
            .map((block) => ({ block, score: scoreKnowledgeBlock(block, normalizedContext) }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
            .map((item) => item.block);

        const selected = ranked.length ? [header, ...ranked] : blocks.slice(0, 10);
        return selected.join('\n\n').slice(0, MAX_KNOWLEDGE_CHARS);
    } catch (error) {
        console.log('No se pudo cargar base de conocimiento para sugerencia IA:', error.message);
        return '';
    }
}

const buildSuggestionPrompt = ({ customerName, summary, transcript, knowledgeSnapshot, draft }) => [
    buildSpaExpertToneInstructions(customerName),
    '',
    'Actua como copiloto para una persona de recepcion que atiende este chat de WhatsApp.',
    'Genera un borrador listo para pegar en el compositor. La persona lo revisara y decidira si lo envia.',
    'Responde solo con el texto sugerido para el cliente, sin prefacios, sin comillas, sin JSON y sin etiquetas.',
    'Mantente breve: 1 a 4 parrafos cortos de WhatsApp.',
    'No inventes precios, promociones, horarios, disponibilidad, diagnosticos ni politicas. Si falta un dato, pregunta o sugiere confirmarlo con el equipo.',
    'Si el cliente quiere agendar, ayuda a avanzar al siguiente dato necesario o a revisar disponibilidad, sin prometer un horario especifico.',
    draft ? 'Toma en cuenta el borrador actual del agente y mejoralo sin cambiar la intencion.' : '',
    '',
    'Resumen operativo actual:',
    summary?.summary || 'Sin resumen previo.',
    summary?.nextStep ? `Siguiente paso sugerido: ${summary.nextStep}` : '',
    '',
    'Conversacion reciente:',
    transcript.join('\n') || 'Sin mensajes recientes relevantes.',
    '',
    draft ? `Borrador actual del agente: ${draft}` : '',
    '',
    knowledgeSnapshot ? `Base de conocimiento disponible:\n${knowledgeSnapshot}` : 'Base de conocimiento disponible: no cargada.'
].filter(Boolean).join('\n');

const normalizeSuggestion = (answer) => {
    const cleaned = cleanWhatsappText(answer)
        .replace(/^respuesta(?:\s+sugerida)?\s*:\s*/i, '')
        .replace(/^borrador\s*:\s*/i, '')
        .trim();

    return compactText(cleaned, MAX_SUGGESTION_CHARS);
}

const buildLocalFallbackSuggestion = ({ messages, summary }) => {
    const lastInbound = getLastInboundMessage(messages);
    const context = normalizeText([
        lastInbound?.text,
        summary?.summary,
        summary?.nextStep
    ].filter(Boolean).join(' '));

    if(/cita|agend|horario|disponible|reserv|reagend|cancel/.test(context)) {
        return 'Claro, con gusto te ayudo a revisarlo.\n\nPara avanzar, me confirmas que dia u horario te quedaria mejor y para cuantas personas seria? Asi podemos revisar la disponibilidad con mas precision.';
    }

    if(/precio|cuesta|costo|servicio|tratamiento|facial|masaje|depilacion|laser/.test(context)) {
        return 'Claro, con gusto te oriento.\n\nPara recomendarte mejor, me puedes contar que tratamiento o resultado estas buscando? Con eso te comparto la opcion mas adecuada y, si hace falta, lo confirmo con el equipo.';
    }

    if(lastInbound?.text) {
        return 'Claro, con gusto te apoyo.\n\nPor lo que me comentas, lo reviso y te confirmo la mejor forma de avanzar.';
    }

    return 'Hola, con gusto te apoyo. Me puedes contar un poco mas sobre lo que necesitas?';
}

const generateReplySuggestion = async (phoneNumber, messages = [], options = {}) => {
    if(!phoneNumber) {
        const error = new Error('Telefono requerido para generar sugerencia.');
        error.status = 400;
        throw error;
    }

    const transcript = buildConversationTranscript(messages);
    if(!transcript.length) {
        return {
            suggestion: buildLocalFallbackSuggestion({ messages, summary: null }),
            provider: 'local',
            source: 'local_fallback',
            generatedAt: new Date().toISOString()
        };
    }

    const [customerName, summary] = await Promise.all([
        CustomerProfile.getFirstName(phoneNumber).catch(() => null),
        ChatSummaryService.getSummary(phoneNumber).catch(() => null)
    ]);
    const knowledgeSnapshot = await buildKnowledgeSnapshot({ messages, summary });
    const draft = compactText(options.draft, 500);

    try {
        const result = await askWithFallback({
            instructions: 'Eres un copiloto que redacta respuestas de WhatsApp para agentes humanos. Devuelve solo el borrador final.',
            history: [],
            message: buildSuggestionPrompt({ customerName, summary, transcript, knowledgeSnapshot, draft })
        });

        const suggestion = normalizeSuggestion(result.answer);
        if(!suggestion) throw new Error('La IA devolvio una sugerencia vacia.');

        return {
            suggestion,
            provider: result.provider,
            source: 'ai',
            generatedAt: new Date().toISOString()
        };
    } catch (error) {
        console.log('No se pudo generar sugerencia con IA. Usando fallback local:', error.message);
        return {
            suggestion: buildLocalFallbackSuggestion({ messages, summary }),
            provider: 'local',
            source: 'local_fallback',
            warning: 'La IA no estuvo disponible; se genero una sugerencia basica local.',
            generatedAt: new Date().toISOString()
        };
    }
}

module.exports = {
    generateReplySuggestion,
    buildConversationTranscript,
    buildLocalFallbackSuggestion,
    normalizeSuggestion
};
