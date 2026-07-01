const test = require('node:test');
const assert = require('node:assert/strict');

const loadSummaryServiceWithMocks = ({ askWithFallback, store }) => {
    const servicePath = require.resolve('../models/chatSummaryService');
    const geminiPath = require.resolve('../models/gemini');
    const storePath = require.resolve('../models/chatSummaryStore');
    const previousGemini = require.cache[geminiPath];
    const previousStore = require.cache[storePath];

    delete require.cache[servicePath];
    require.cache[geminiPath] = {
        id: geminiPath,
        filename: geminiPath,
        loaded: true,
        exports: { askWithFallback }
    };
    require.cache[storePath] = {
        id: storePath,
        filename: storePath,
        loaded: true,
        exports: store
    };

    const service = require('../models/chatSummaryService');

    return {
        service,
        cleanup: () => {
            delete require.cache[servicePath];
            if(previousGemini) require.cache[geminiPath] = previousGemini;
            else delete require.cache[geminiPath];
            if(previousStore) require.cache[storePath] = previousStore;
            else delete require.cache[storePath];
        }
    };
};

test('generateDetailedContext falls back to local context when AI providers are unavailable', async () => {
    const unavailableError = new Error('No hay proveedores de IA disponibles.');
    unavailableError.allProvidersFailed = true;

    let savedContext = null;
    const store = {
        getLatestSummary: async () => ({
            summary: 'El cliente esta revisando una cita y necesita orientacion.',
            nextStep: 'Confirmar el estado de la cita antes de responder.'
        }),
        saveDetailedContext: async (_phoneNumber, context) => {
            savedContext = context;
            return { ...context, updatedAt: '2026-06-22T20:30:00.000Z' };
        }
    };

    const { service, cleanup } = loadSummaryServiceWithMocks({
        askWithFallback: async () => {
            throw unavailableError;
        },
        store
    });

    try {
        const context = await service.generateDetailedContext('529811695579', [
            {
                direction: 'out',
                source: 'bot',
                type: 'text',
                text: 'Te recordamos tu cita confirmada para jueves.'
            },
            {
                direction: 'in',
                source: 'client',
                type: 'text',
                text: 'Alguna sugerencia antes de mi cita?',
                createdAt: '2026-06-22T20:20:00.000Z'
            }
        ]);

        assert.equal(context.priority, 'media');
        assert.equal(context.currentNeed, 'Alguna sugerencia antes de mi cita?');
        assert.equal(context.suggestedAction, 'Confirmar el estado de la cita antes de responder.');
        assert.equal(savedContext.usefulContext.some((item) => item.includes('cita confirmada')), false);
    } finally {
        cleanup();
    }
});
