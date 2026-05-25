const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { OpenAI } = require('openai');
const Redis = require('../config/redis');
const Messages = require('./messages');
const { findMediaForText } = require('../utils/serviceMedia');
const { findService, normalizeText } = require('../utils/appointmentsConfig');

const BASE_PATH = path.join(__dirname, '..', 'utils', 'base.txt');

const getKnowledgeBase = () => {
    if(!fs.existsSync(BASE_PATH)) return '';
    return fs.readFileSync(BASE_PATH, 'utf8');
}

const cleanKnowledgeAnswer = (answer) => String(answer || '')
    .replace(/\[cite:\s*\d+(?:,\s*\d+)*\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const getRelevantKnowledgeBase = (message) => {
    const knowledgeBase = getKnowledgeBase();
    const normalizedMessage = normalizeText(message);
    const blocks = knowledgeBase.split(/\n\s*\n(?=P:)/);
    const serviceKeywords = ['thessa', 'servicios', 'lumi piel', 'chocolaterapia', 'royal skin', 'seda effect', 'soft harmony'];
    const matchedKeywords = serviceKeywords.filter((keyword) => normalizedMessage.includes(normalizeText(keyword)));

    if(!matchedKeywords.length) return blocks.slice(0, 2).join('\n\n');

    const selected = blocks.filter((block) => {
        const normalizedBlock = normalizeText(block);
        return matchedKeywords.some((keyword) => normalizedBlock.includes(normalizeText(keyword)));
    });

    return (selected.length ? selected : blocks.slice(0, 2)).join('\n\n');
}

const getLocalKnowledgeAnswer = (message) => {
    const knowledgeBase = getKnowledgeBase();
    const normalizedMessage = normalizeText(message);
    const blocks = knowledgeBase.split(/\n\s*\n(?=P:)/);

    if(normalizedMessage.includes('servicios') || normalizedMessage.includes('tratamientos')) {
        const block = blocks.find((item) => normalizeText(item).includes('que servicios ofrecen'));
        const answer = block && block.split(/\nR:\s*/)[1];
        return cleanKnowledgeAnswer(answer);
    }

    const service = findService(message);
    if(!service) return null;

    const serviceBlocks = blocks.filter((item) => normalizeText(item).includes(normalizeText(service.name)));
    const serviceBlock = serviceBlocks.find((item) => {
        const normalizedBlock = normalizeText(item);
        return normalizedBlock.includes('cuanto cuesta') ||
            normalizedBlock.includes('precio') ||
            normalizedBlock.includes('incluye');
    }) || serviceBlocks[0];
    const answer = serviceBlock && serviceBlock.split(/\nR:\s*/)[1];
    return cleanKnowledgeAnswer(answer);
}

const buildInstructions = (knowledgeBase) => [
    'Responde como una persona del equipo de atencion de Thessa escribiendo por WhatsApp.',
    'Habla en primera persona plural cuando sea natural, por ejemplo "te podemos ayudar" o "con gusto te comparto".',
    'Usa un tono calido, cercano y humano, como si estuvieras atendiendo a una clienta real por WhatsApp.',
    'Suena natural y conversacional: puedes usar frases como "claro", "con gusto", "te cuento", "por lo que me comentas" o "si te late".',
    'Usa emojis con moderacion cuando ayuden a dar calidez o claridad, por ejemplo ✨, 🍃, 💆‍♀️, 🤍 o 📅. No uses mas de 1 o 2 emojis por respuesta.',
    'Responde en espanol, de forma clara, breve y con ritmo de WhatsApp.',
    'Evita respuestas demasiado formales o acartonadas. No repitas siempre la misma estructura.',
    'Cuando sea natural, haz una pequena recomendacion o siguiente paso, sin presionar.',
    'Usa exclusivamente la informacion de la base de conocimiento para responder sobre servicios, precios e inclusiones.',
    'Si no tienes la informacion, di de forma amable que necesitas confirmarlo con el equipo.',
    'No inventes precios, promociones, horarios ni ubicaciones.',
    'Si el cliente pregunta por disponibilidad, horarios para cita, agendar, reagendar o cancelar, no digas que no tienes acceso al calendario. Pidele de forma natural servicio, dia, hora, nombre y numero de personas para que el flujo de citas lo atienda.',
    'No incluyas etiquetas como [cite: 1] en la respuesta final.',
    'Evita frases como "soy el asistente", "como IA", "segun la base de conocimiento" o similares.',
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
    const redis = await Redis();
    const rawHistory = await redis.get(`${number}:gemini:history`);
    if(!rawHistory) return [];

    try {
        return JSON.parse(rawHistory);
    } catch (error) {
        await redis.del(`${number}:gemini:history`);
        return [];
    }
}

const saveConversationHistory = async (number, history) => {
    const redis = await Redis();
    const recentHistory = history.slice(-4);
    await redis.set(`${number}:gemini:history`, JSON.stringify(recentHistory));
    await redis.expire(`${number}:gemini:history`, 86400);
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
        const localAnswer = getLocalKnowledgeAnswer(message);
        if(localAnswer) {
            await Messages.sendTextMessage(localAnswer, number, { source: 'ia' });
            await sendMediaMatches(number, message);
            return null;
        }

        const knowledgeBase = getRelevantKnowledgeBase(message);
        const history = await getConversationHistory(number);
        const instructions = buildInstructions(knowledgeBase);
        const result = await askWithFallback({ instructions, history, message });
        const answer = result.answer;

        await saveConversationHistory(number, [
            ...history,
            { role: 'cliente', content: message },
            { role: 'asistente', content: answer }
        ]);

        await Messages.sendTextMessage(answer, number, { source: 'ia' });
        await sendMediaMatches(number, message);
    } catch (error) {
        console.error('AI fallback error:', error.status || error.code || '', error.message);
        const text = error.allProvidersFailed
            ? 'Dame un momentito, por ahora no puedo consultar esa informacion automaticamente. Si gustas, el equipo puede ayudarte a confirmarlo 🤍'
            : 'Dame un momentito, no pude revisar esa informacion ahora. Lo podemos confirmar con el equipo con gusto 🤍';
        await Messages.sendTextMessage(text, number, { source: 'ia' });
    }

    return null;
}

module.exports = { geminiProccess, askWithFallback }
