const { GoogleGenAI } = require('@google/genai');
const { OpenAI } = require('openai');
const StateStore = require('./stateStore');
const Messages = require('./messages');
const CustomerProfile = require('./customerProfile');
const ChatStore = require('./chatStore');
const { findMediaForText } = require('../utils/serviceMedia');
const { normalizeText } = require('../utils/configCitas');
const { buildSpaExpertToneInstructions, cleanWhatsappText } = require('./aiResponseStyle');
const ServicesRepository = require('./servicesRepository');
const ResponseGuard = require('../utils/responseGuard');




const getRelevantKnowledgeBase = async (message) => {
    const knowledgeBase = await ServicesRepository.buildKnowledgeBase();
    const normalizedMessage = normalizeText(message);
    const blocks = knowledgeBase.split(/\n\s*\n(?=P:)/);
    const serviceKeywords = [
        'thessa',
        'servicios',
        'facial',
        'faciales',
        'masaje',
        'masajes',
        'corporal',
        'corporales',
        'depilacion',
        'depilaciones',
        'laser',
        'medicina estetica',
        'fisioterapia'
    ];
    const matchedKeywords = serviceKeywords.filter((keyword) => normalizedMessage.includes(normalizeText(keyword)));

    if(!matchedKeywords.length) return blocks.slice(0, 2).join('\n\n');

    const selected = blocks.filter((block) => {
        const normalizedBlock = normalizeText(block);
        return matchedKeywords.some((keyword) => normalizedBlock.includes(normalizeText(keyword)));
    });

    return (selected.length ? selected : blocks.slice(0, 2)).join('\n\n');
}

const buildInstructions = (knowledgeBase, customerName = null) => [
    buildSpaExpertToneInstructions(customerName),
    'Usa exclusivamente la informacion de la base de conocimiento para responder sobre servicios, precios e inclusiones.',
    'Si el cliente pregunta por disponibilidad, horarios para cita o agendar, responde de forma natural sobre el servicio y cierra invitandole a reservar, pero nunca le pidas tocar "Agendar cita" en el menu. El sistema enviara el boton correcto para iniciar la cita con el servicio recomendado.',
    'Si el cliente menciona una fecha relativa como "manana", "hoy" o un dia de la semana, reconoce el dia con naturalidad. No lo redirijas al menu ni le digas que toque botones: el sistema enviara las opciones de cita correspondientes.',
    'No incluyas etiquetas como [cite: 1] en la respuesta final.',
    '',
    'Base de conocimiento:',
    knowledgeBase
].join('\n');

const buildGeminiPrompt = (instructions, history, message) => [
    instructions,
    '',
    'Conversacion reciente:',
    history.map((item) => `${item.role}: ${item.content}`).join('\n') || 'Sin historial.',
    '',
    `Pregunta del cliente: ${message}`
].join('\n');

const buildDeepSeekMessages = (instructions, history, message) => {
    const recentHistory = history.slice(-4).map((item) => ({
        role: item.role === 'asistente' ? 'assistant' : 'user',
        content: item.content
    }));

    return [
        { role: 'system', content: instructions },
        ...recentHistory,
        { role: 'user', content: message }
    ];
}

const isQuotaError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return error && (
        error.status === 429 ||
        error.code === 429 ||
        message.includes('resource_exhausted') ||
        message.includes('quota') ||
        message.includes('rate limit') ||
        message.includes('insufficient')
    );
}

const getConversationHistory = async (number) => {
    const rawHistory = await StateStore.get(`${number}:gemini:history`);
    if(!rawHistory) return [];

    try {
        return JSON.parse(rawHistory);
    } catch (error) {
        await StateStore.del(`${number}:gemini:history`);
        return [];
    }
}

const saveConversationHistory = async (number, history) => {
    const recentHistory = history.slice(-4);
    await StateStore.set(`${number}:gemini:history`, JSON.stringify(recentHistory), 86400);
}

const askGemini = async ({ instructions, history, message }) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if(!apiKey) {
        const error = new Error('Falta GEMINI_API_KEY.');
        error.missingConfig = true;
        throw error;
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
        model,
        contents: buildGeminiPrompt(instructions, history, message)
    });

    return {
        provider: 'gemini',
        answer: response.text || 'No pude generar una respuesta en este momento.'
    };
}

const askDeepSeek = async ({ instructions, history, message }) => {
    if(!process.env.DEEPSEEK_API_KEY) {
        const error = new Error('Falta DEEPSEEK_API_KEY.');
        error.missingConfig = true;
        throw error;
    }

    const deepseek = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
    });

    const response = await deepseek.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: buildDeepSeekMessages(instructions, history, message),
        max_tokens: 350,
        temperature: 0.7
    });

    return {
        provider: 'deepseek',
        answer: response.choices[0]?.message?.content || 'No pude generar una respuesta en este momento.'
    };
}

const askWithFallback = async (payload) => {
    const providers = [
        { name: 'gemini', ask: askGemini },
        { name: 'deepseek', ask: askDeepSeek }
    ];
    const errors = [];

    for(const provider of providers) {
        try {
            return await provider.ask(payload);
        } catch (error) {
            console.error(`${provider.name} error:`, error.status || error.code || '', error.message);
            errors.push({ provider: provider.name, error });

            if(!error.missingConfig && !isQuotaError(error)) throw error;
        }
    }

    const error = new Error('No hay proveedores de IA disponibles.');
    error.allProvidersFailed = true;
    error.errors = errors;
    throw error;
}

const sendMediaMatches = async (number, message) => {
    const mediaFiles = findMediaForText(message);
    for(const file of mediaFiles) {
        await Messages.sendLocalMedia(file, number, { source: 'ia' });
    }
}

const geminiProccess = async (message, number) => {
    try {
        const customerName = await CustomerProfile.getFirstName(number);
        const knowledgeBase = await getRelevantKnowledgeBase(message);
        const history = await getConversationHistory(number);
        const instructions = buildInstructions(knowledgeBase, customerName);
        const result = await askWithFallback({ instructions, history, message });
        const answer = cleanWhatsappText(result.answer);

        if(!await ResponseGuard.shouldSend({ phoneNumber: number })) {
            return { stale: true, provider: result.provider };
        }

        await saveConversationHistory(number, [
            ...history,
            { role: 'cliente', content: message },
            { role: 'asistente', content: answer }
        ]);

        await Messages.sendTextMessage(answer, number, { source: 'ia' });
        ChatStore.clearAlert(number, 'ai_unavailable');
        await sendMediaMatches(number, message);
        return { answer, provider: result.provider };
    } catch (error) {
        console.error('AI fallback error:', error.status || error.code || '', error.message);
        const alertState = ChatStore.setAlert(number, {
            type: 'ai_unavailable',
            severity: 'critical',
            title: error.allProvidersFailed ? 'IA sin disponibilidad' : 'IA requiere revision',
            message: error.allProvidersFailed
                ? 'Se agotaron los proveedores/tokens de IA o no estan disponibles. Toma este chat manualmente.'
                : 'La IA fallo al responder. Revisa este chat manualmente antes de continuar.'
        });

        if(alertState?.isNew) {
            await Messages.sendTextMessage('Permitenos revisarlo con el equipo para confirmarte bien. En un momento te apoyamos por aqui.', number, { source: 'ia' });
        }

        return { error };
    }
}

module.exports = { geminiProccess, askWithFallback }
