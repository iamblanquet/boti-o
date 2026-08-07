const { GoogleGenAI } = require('@google/genai');
const { OpenAI } = require('openai');
const { normalizeText } = require('../utils/configCitas');

let geminiClient = null;
let openaiClient = null;

const INTENTS = {
    CONSULTAR_SERVICIO: 'consultar_servicio',
    RECOMENDAR_SERVICIO: 'recomendar_servicio',
    AGENDAR_CITA: 'agendar_cita',
    FAQ: 'faq',
    PROMOCIONES: 'promociones',
    DESCONOCIDO: 'desconocido'
};

const DATA_FIELDS = {
    PRECIO: 'precio',
    DURACION: 'duracion',
    BENEFICIOS: 'beneficios',
    PRODUCTOS: 'productos',
    DESCRIPCION: 'descripcion',
    GENERAL: 'general'
};

const PROBLEM_KEYWORDS = [
    'manchas',
    'acne',
    'arrugas',
    'flacidez',
    'grasa',
    'piel seca',
    'hidratacion',
    'poros',
    'ojeras',
    'cicatrices',
    'celulitis',
    'dolor',
    'contractura',
    'estres',
    'relajacion',
    'piernas cansadas'
];

const cleanJson = (text) => {
    const value = String(text || '').trim();
    const match = value.match(/\{[\s\S]*\}/);
    return match ? match[0] : value;
}

const getGemini = () => {
    if(geminiClient) return geminiClient;
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if(!apiKey) return null;
    geminiClient = new GoogleGenAI({ apiKey });
    return geminiClient;
}

const getOpenAi = () => {
    if(openaiClient) return openaiClient;
    const apiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY;
    if(!apiKey) return null;
    openaiClient = new OpenAI({ apiKey });
    return openaiClient;
}

const hasAny = (value, keywords) => keywords.some((keyword) => value.includes(normalizeText(keyword)));

const detectRequestedField = (message) => {
    const value = normalizeText(message);
    if(hasAny(value, ['precio', 'cuanto cuesta', 'cuesta', 'costo', 'vale'])) return DATA_FIELDS.PRECIO;
    if(hasAny(value, ['duracion', 'cuanto dura', 'tiempo tarda', 'tarda'])) return DATA_FIELDS.DURACION;
    if(hasAny(value, ['beneficio', 'beneficios', 'para que sirve'])) return DATA_FIELDS.BENEFICIOS;
    if(hasAny(value, ['producto', 'productos', 'que usan', 'que utilizan', 'con que lo realizan'])) return DATA_FIELDS.PRODUCTOS;
    if(hasAny(value, ['que es', 'como funciona', 'informacion', 'info', 'incluye', 'que incluye'])) return DATA_FIELDS.DESCRIPCION;
    return DATA_FIELDS.GENERAL;
}

const detectRuleIntent = (message) => {
    const value = normalizeText(message);
    const datoSolicitado = detectRequestedField(message);
    const problem = PROBLEM_KEYWORDS.find((keyword) => value.includes(normalizeText(keyword)));

    if(hasAny(value, [
        'agendar', 'agenda', 'cita', 'reservar', 'programar',
        'disponibilidad', 'hay espacio', 'tienen espacio', 'horario disponible'
    ])) {
        return {
            intent: INTENTS.AGENDAR_CITA,
            servicio: null,
            problema: null,
            dato_solicitado: null,
            confidence: 0.9,
            provider: 'rules'
        };
    }

    if(hasAny(value, ['promocion', 'promociones', 'promo', 'descuento', 'paquete'])) {
        return {
            intent: INTENTS.PROMOCIONES,
            servicio: null,
            problema: null,
            dato_solicitado: DATA_FIELDS.GENERAL,
            confidence: 0.9,
            provider: 'rules'
        };
    }

    if(hasAny(value, ['ubicacion', 'direccion', 'donde estan', 'horario', 'horarios', 'instagram', 'facebook'])) {
        return {
            intent: INTENTS.FAQ,
            servicio: null,
            problema: null,
            dato_solicitado: DATA_FIELDS.GENERAL,
            confidence: 0.85,
            provider: 'rules'
        };
    }

    if(problem && hasAny(value, ['quiero', 'tengo', 'algo para', 'me recomiendas', 'recomiendas', 'necesito', 'ayuda'])) {
        return {
            intent: INTENTS.RECOMENDAR_SERVICIO,
            servicio: null,
            problema: problem,
            dato_solicitado: null,
            confidence: 0.75,
            provider: 'rules'
        };
    }

    if(datoSolicitado !== DATA_FIELDS.GENERAL) {
        return {
            intent: INTENTS.CONSULTAR_SERVICIO,
            servicio: null,
            problema: null,
            dato_solicitado: datoSolicitado,
            confidence: 0.7,
            provider: 'rules'
        };
    }

    if(hasAny(value, ['tratamiento', 'servicio', 'facial', 'masaje', 'laser', 'limpieza'])) {
        return {
            intent: INTENTS.CONSULTAR_SERVICIO,
            servicio: null,
            problema: null,
            dato_solicitado: DATA_FIELDS.GENERAL,
            confidence: 0.55,
            provider: 'rules'
        };
    }

    return {
        intent: INTENTS.DESCONOCIDO,
        servicio: null,
        problema: null,
        dato_solicitado: null,
        confidence: 0.3,
        provider: 'rules'
    };
}

const needsAiDetection = (message, ruleResult) => {
    const value = normalizeText(message);
    if(ruleResult.intent === INTENTS.RECOMENDAR_SERVICIO) return true;
    if(ruleResult.intent === INTENTS.DESCONOCIDO && hasAny(value, ['quiero', 'tengo', 'necesito', 'busco', 'recomiendas', 'recomiendame'])) return true;
    if(ruleResult.intent === INTENTS.CONSULTAR_SERVICIO && !ruleResult.servicio && ruleResult.confidence < 0.75) return true;
    return false;
}

const buildPrompt = (message) => [
    'Clasifica el mensaje de una clienta de Thessa Clinica Integral de Belleza y Salud.',
    'No tienes acceso al catalogo completo y no debes inventar servicios, precios ni duraciones.',
    'Devuelve solamente JSON valido, sin markdown.',
    '',
    'Intenciones validas:',
    '- consultar_servicio: pregunta por precio, duracion, descripcion o beneficios de un servicio especifico.',
    '- recomendar_servicio: pide recomendacion por un problema o necesidad, por ejemplo manchas, acne, relajacion o flacidez.',
    '- agendar_cita: quiere agendar, reservar, confirmar disponibilidad o programar cita.',
    '- faq: pregunta por ubicacion, horarios, redes sociales u otra pregunta frecuente.',
    '- promociones: pregunta por promociones, paquetes o descuentos.',
    '- desconocido: no queda claro.',
    '',
    'Campos esperados:',
    '{',
    '  "intent": "consultar_servicio|recomendar_servicio|agendar_cita|faq|promociones|desconocido",',
    '  "servicio": string|null,',
    '  "problema": string|null,',
    '  "dato_solicitado": "precio|duracion|beneficios|productos|descripcion|general"|null',
    '}',
    '',
    `Mensaje: ${message}`
].join('\n');

const validateIntent = (parsed, provider) => {
    const intent = Object.values(INTENTS).includes(parsed.intent) ? parsed.intent : INTENTS.DESCONOCIDO;
    const field = Object.values(DATA_FIELDS).includes(parsed.dato_solicitado)
        ? parsed.dato_solicitado
        : null;

    return {
        intent,
        servicio: parsed.servicio || null,
        problema: parsed.problema || null,
        dato_solicitado: field,
        confidence: provider === 'rules' ? parsed.confidence || 0.3 : 0.85,
        provider
    };
}

const detectWithGemini = async (message) => {
    const ai = getGemini();
    if(!ai) return null;

    const response = await ai.models.generateContent({
        model: process.env.GEMINI_INTENT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        contents: buildPrompt(message)
    });

    return validateIntent(JSON.parse(cleanJson(response.text)), 'gemini');
}

const detectWithOpenAi = async (message) => {
    const openai = getOpenAi();
    if(!openai) return null;

    const result = await openai.chat.completions.create({
        model: process.env.OPENAI_INTENT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
            { role: 'system', content: 'Eres un clasificador de intencion. Responde solo JSON valido.' },
            { role: 'user', content: buildPrompt(message) }
        ],
        temperature: 0,
        max_tokens: 180
    });

    return validateIntent(JSON.parse(cleanJson(result.choices[0]?.message?.content)), 'openai');
}

const detectIntent = async (message, options = {}) => {
    const ruleResult = detectRuleIntent(message);
    if(!options.forceAi && !needsAiDetection(message, ruleResult)) return ruleResult;

    try {
        const geminiResult = await detectWithGemini(message);
        if(geminiResult) return geminiResult;
    } catch (error) {
        console.log('servicesIntentDetector Gemini error:', error.message);
    }

    try {
        const openaiResult = await detectWithOpenAi(message);
        if(openaiResult) return openaiResult;
    } catch (error) {
        console.log('servicesIntentDetector OpenAI error:', error.message);
    }

    return ruleResult;
}

module.exports = {
    INTENTS,
    DATA_FIELDS,
    detectRuleIntent,
    detectIntent
};
