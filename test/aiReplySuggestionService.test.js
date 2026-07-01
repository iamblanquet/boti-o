const test = require('node:test');
const assert = require('node:assert/strict');

const loadSuggestionServiceWithMocks = ({
    askWithFallback,
    summary = null,
    knowledgeBase = 'Thessa - base de conocimiento',
    firstName = null
}) => {
    const servicePath = require.resolve('../models/aiReplySuggestionService');
    const geminiPath = require.resolve('../models/gemini');
    const summaryPath = require.resolve('../models/chatSummaryService');
    const customerPath = require.resolve('../models/customerProfile');
    const servicesPath = require.resolve('../models/servicesRepository');

    const previous = {
        service: require.cache[servicePath],
        gemini: require.cache[geminiPath],
        summary: require.cache[summaryPath],
        customer: require.cache[customerPath],
        services: require.cache[servicesPath]
    };

    delete require.cache[servicePath];
    require.cache[geminiPath] = {
        id: geminiPath,
        filename: geminiPath,
        loaded: true,
        exports: { askWithFallback }
    };
    require.cache[summaryPath] = {
        id: summaryPath,
        filename: summaryPath,
        loaded: true,
        exports: {
            getSummary: async () => summary,
            isRelevantMessage: (message) => Boolean(message?.text && message.type !== 'note')
        }
    };
    require.cache[customerPath] = {
        id: customerPath,
        filename: customerPath,
        loaded: true,
        exports: { getFirstName: async () => firstName }
    };
    require.cache[servicesPath] = {
        id: servicesPath,
        filename: servicesPath,
        loaded: true,
        exports: { buildKnowledgeBase: async () => knowledgeBase }
    };

    const service = require('../models/aiReplySuggestionService');

    return {
        service,
        cleanup: () => {
            delete require.cache[servicePath];
            Object.entries({
                [geminiPath]: previous.gemini,
                [summaryPath]: previous.summary,
                [customerPath]: previous.customer,
                [servicesPath]: previous.services
            }).forEach(([path, cacheEntry]) => {
                if(cacheEntry) require.cache[path] = cacheEntry;
                else delete require.cache[path];
            });
            if(previous.service) require.cache[servicePath] = previous.service;
        }
    };
};

test('generateReplySuggestion returns a cleaned AI draft without sending it', async () => {
    let requestPayload = null;
    const { service, cleanup } = loadSuggestionServiceWithMocks({
        firstName: 'Ana',
        summary: {
            summary: 'La clienta pregunta por limpieza facial.',
            nextStep: 'Orientar y ofrecer revisar agenda.'
        },
        knowledgeBase: [
            'Thessa - base de conocimiento',
            'P: Limpieza Facial',
            'Descripcion: Tratamiento facial de limpieza profunda.'
        ].join('\n'),
        askWithFallback: async (payload) => {
            requestPayload = payload;
            return {
                provider: 'gemini',
                answer: 'Respuesta sugerida: **Hola Ana**, con gusto te oriento.\n\nLa limpieza facial puede ayudarte a retirar impurezas y dejar la piel mas fresca.'
            };
        }
    });

    try {
        const result = await service.generateReplySuggestion('529811695579', [
            { direction: 'in', source: 'client', type: 'text', text: 'Me interesa una limpieza facial' }
        ]);

        assert.equal(result.provider, 'gemini');
        assert.equal(result.source, 'ai');
        assert.equal(result.suggestion.startsWith('Respuesta sugerida:'), false);
        assert.equal(result.suggestion.includes('**'), false);
        assert.match(result.suggestion, /Hola Ana/);
        assert.match(requestPayload.message, /Cliente: Me interesa una limpieza facial/);
    } finally {
        cleanup();
    }
});

test('generateReplySuggestion falls back locally when AI is unavailable', async () => {
    const { service, cleanup } = loadSuggestionServiceWithMocks({
        summary: {
            summary: 'El cliente quiere agendar una cita.',
            nextStep: 'Pedir dia y horario.'
        },
        askWithFallback: async () => {
            throw new Error('No hay proveedores de IA disponibles.');
        }
    });

    try {
        const result = await service.generateReplySuggestion('529811695579', [
            { direction: 'in', source: 'client', type: 'text', text: 'Quiero agendar cita manana' }
        ]);

        assert.equal(result.provider, 'local');
        assert.equal(result.source, 'local_fallback');
        assert.match(result.suggestion, /dia u horario/);
        assert.match(result.warning, /IA no estuvo disponible/);
    } finally {
        cleanup();
    }
});
