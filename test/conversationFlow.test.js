const test = require('node:test');
const assert = require('node:assert/strict');

const {
    matchesKeyword,
    findStepResponse
} = require('../models/guidedFlowRunner');
const {
    getCandidateBusinessDates
} = require('../models/citas/disponibilidad');
const {
    overlaps
} = require('../models/citas/verificadorDisponibilidad');
const CatalogStore = require('../models/serviceCatalogStore');

const catalogFixture = {
    service_categories: [
        { id: 'depilaciones', name: 'Depilaciones', active: true, sort_order: 1 },
        { id: 'masajes', name: 'Masajes', active: true, sort_order: 2 },
        { id: 'faciales', name: 'Faciales', active: true, sort_order: 3 }
    ],
    services: [
        {
            id: 'depilacion-laser-medio-brazo',
            category_id: 'depilaciones',
            name: 'Depilación Láser - Medio Brazo',
            description: 'Depilación láser diodo para medio brazo. Técnica avanzada para eliminar el vello de forma permanente y segura.',
            duration_minutes: 30,
            price: 275,
            image: '',
            benefits: ['Resultados duraderos', 'Procedimiento indoloro'],
            problems: ['vello'],
            keywords: ['depilacion laser - medio brazo', 'depilacion', 'laser', 'medio', 'brazo'],
            active: true,
            sort_order: 1
        },
        {
            id: 'depilacion-laser-manos',
            category_id: 'depilaciones',
            name: 'Depilación Láser - Manos',
            description: 'Depilación láser diodo para manos.',
            duration_minutes: 25,
            price: 250,
            image: '',
            benefits: ['Piel suave', 'Resultados duraderos'],
            problems: ['vello en manos'],
            keywords: ['depilacion laser - manos', 'depilacion', 'laser', 'manos'],
            active: true,
            sort_order: 2
        },
        {
            id: 'masaje-relajante',
            category_id: 'masajes',
            name: 'Masaje Relajante',
            description: 'Masaje suave para relajacion profunda.',
            duration_minutes: 50,
            price: 900,
            image: '',
            benefits: ['Relajacion profunda'],
            problems: ['relajacion'],
            keywords: ['masaje relajante', 'relajacion'],
            active: true,
            sort_order: 1
        }
    ],
    service_prices: [
        { service_id: 'depilacion-laser-medio-brazo', people: 1, price: 275, exclusive: false, note: '' },
        { service_id: 'depilacion-laser-manos', people: 1, price: 250, exclusive: false, note: '' },
        { service_id: 'masaje-relajante', people: 1, price: 900, exclusive: false, note: '' }
    ],
    service_faqs: [
        { id: 'ubicacion', question: 'Donde estan ubicados?', answer: 'Estamos en Claustro framboyanes 6, Tabasco 2000.', active: true, sort_order: 1 }
    ]
};

const createReadOnlySupabaseMock = (fixture = catalogFixture) => ({
    from(table) {
        return {
            select: async () => ({ data: fixture[table] || [], error: null }),
            insert: async () => ({ data: null, error: null }),
            upsert: async () => ({ data: null, error: null }),
            update() { return this; },
            delete() { return this; },
            eq: async () => ({ data: null, error: null })
        };
    }
});

CatalogStore.__setTestClient(createReadOnlySupabaseMock());

test('service questions with a greeting are prioritized over the welcome menu', async () => {
    const ConversationEngine = require('../models/conversationEngine');
    const ServicesRepository = require('../models/servicesRepository');

    assert.equal(ConversationEngine.shouldPrioritizeServiceIntent('hola'), false);
    assert.equal(ConversationEngine.shouldPrioritizeServiceIntent('Hola, quiero informacion de sus servicios'), true);
    assert.equal(ConversationEngine.shouldPrioritizeServiceIntent('Que me recomiendas para acne?'), true);
    assert.equal(ConversationEngine.shouldPrioritizeServiceIntent('Cuanto cuesta un masaje relajante?'), true);

    const category = await ServicesRepository.findCategoryByMessage('Hola, me gustaria informacion acerca de sus servicios de Depilacion laser');
    assert.equal(category?.nombre, 'Depilaciones');
    assert.equal(await ServicesRepository.findServiceByName('Hola, me gustaria informacion acerca de sus servicios de Depilacion laser'), null);
    assert.equal((await ServicesRepository.findServiceByName('Me gustaria informacion acerca de depilacion de medio brazo'))?.nombre, 'Depilación Láser - Medio Brazo');
});

test('incoming service question is handled by services before guided welcome buttons', async () => {
    const StateStore = require('../models/stateStore');
    const Messages = require('../models/messages');
    const ChatStore = require('../models/chatStore');
    const CustomerProfile = require('../models/customerProfile');
    const Clients = require('../models/clients');
    const ServiceFollowup = require('../models/serviceFollowup');
    const ConversationEngine = require('../models/conversationEngine');

    const originals = {
        sendMessage: Messages.sendMessage,
        sendTextMessage: Messages.sendTextMessage,
        sendLocalMedia: Messages.sendLocalMedia,
        addMessage: ChatStore.addMessage,
        rememberName: CustomerProfile.rememberName,
        rememberFromMessage: CustomerProfile.rememberFromMessage,
        verifyStoreClient: Clients.verifyStoreClient,
        saveOfferState: ServiceFollowup.saveOfferState
    };

    const phoneNumber = '5219990000001';
    const sent = [];

    Messages.sendMessage = async (payload) => {
        sent.push(payload);
        return { data: { messages: [{ id: 'test-message' }] } };
    };
    Messages.sendTextMessage = async (text, phone) => {
        sent.push({ type: 'text', text, phoneNumber: phone });
    };
    Messages.sendLocalMedia = async () => null;
    ChatStore.addMessage = () => {};
    CustomerProfile.rememberName = async () => {};
    CustomerProfile.rememberFromMessage = async () => {};
    Clients.verifyStoreClient = async () => {};
    ServiceFollowup.saveOfferState = async () => null;

    try {
        await StateStore.del(`${phoneNumber}:steps`);
        await StateStore.del(`${phoneNumber}:tool`);

        const result = await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Mau',
            messageText: 'Hola me gustaria informacion acerca de sus servicios de Depilacion laser',
            messageId: 'incoming-service-question',
            type: 'text'
        });

        assert.equal(result.handledBy, 'catalog-list-template');
        assert.equal(sent[0].type, 'list');
        assert.match(sent[0].text, /servicios de Depilaciones/i);
        assert.doesNotMatch(sent[0].text, /bienvenida a Thessa/i);

        sent.length = 0;
        const exactResult = await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Mau',
            messageText: 'Me gustaria informacion acerca de depilacion de medio brazo',
            messageId: 'incoming-exact-service-question',
            type: 'text'
        });

        assert.equal(exactResult.handledBy, 'service-template');
        assert.equal(sent[0].type, 'text');
        assert.match(sent[0].text, /Depilaci.n L.ser - Medio Brazo/i);
        assert.match(sent[0].text, /Duracion aproximada: 30 minutos/i);
        assert.doesNotMatch(sent[0].text, /Elige uno/i);
    } finally {
        Messages.sendMessage = originals.sendMessage;
        Messages.sendTextMessage = originals.sendTextMessage;
        Messages.sendLocalMedia = originals.sendLocalMedia;
        ChatStore.addMessage = originals.addMessage;
        CustomerProfile.rememberName = originals.rememberName;
        CustomerProfile.rememberFromMessage = originals.rememberFromMessage;
        Clients.verifyStoreClient = originals.verifyStoreClient;
        ServiceFollowup.saveOfferState = originals.saveOfferState;
        await StateStore.del(`${phoneNumber}:steps`);
        await StateStore.del(`${phoneNumber}:tool`);
    }
});

test('recommendations and open doubts are answered by AI instead of catalog ranking', async () => {
    const StateStore = require('../models/stateStore');
    const Messages = require('../models/messages');
    const ChatStore = require('../models/chatStore');
    const CustomerProfile = require('../models/customerProfile');
    const Clients = require('../models/clients');
    const ServiceFollowup = require('../models/serviceFollowup');
    const FlujoCitas = require('../models/citas/flujo');
    const Gemini = require('../models/gemini');
    const ConversationEngine = require('../models/conversationEngine');

    const originals = {
        sendMessage: Messages.sendMessage,
        sendTextMessage: Messages.sendTextMessage,
        sendLocalMedia: Messages.sendLocalMedia,
        addMessage: ChatStore.addMessage,
        rememberName: CustomerProfile.rememberName,
        rememberFromMessage: CustomerProfile.rememberFromMessage,
        verifyStoreClient: Clients.verifyStoreClient,
        saveOfferState: ServiceFollowup.saveOfferState,
        geminiProccess: Gemini.geminiProccess,
        iniciarConServicio: FlujoCitas.iniciarConServicio
    };

    const phoneNumber = `5219990000004${Date.now()}`;
    const sent = [];
    let geminiMessage = null;
    let appointmentService = null;

    Messages.sendMessage = async (payload) => {
        sent.push(payload);
        return { data: { messages: [{ id: 'test-message' }] } };
    };
    Messages.sendTextMessage = async (text, phone) => {
        sent.push({ type: 'text', text, phoneNumber: phone });
    };
    Messages.sendLocalMedia = async () => null;
    ChatStore.addMessage = () => {};
    CustomerProfile.rememberName = async () => {};
    CustomerProfile.rememberFromMessage = async () => {};
    Clients.verifyStoreClient = async () => {};
    ServiceFollowup.saveOfferState = async () => null;
    Gemini.geminiProccess = async (message) => {
        geminiMessage = message;
        return { answer: 'Te recomiendo Depilación Láser - Manos para esa zona.' };
    };
    FlujoCitas.iniciarConServicio = async (_phone, service) => {
        appointmentService = service;
        return true;
    };

    try {
        await StateStore.del(`${phoneNumber}:steps`);
        await StateStore.del(`${phoneNumber}:tool`);

        assert.equal(
            ConversationEngine.isRecommendationOrDoubtRequest('Hola que me recomiendas para depilaciones en mis manos?'),
            true
        );

        const result = await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Mau',
            messageText: 'Hola que me recomiendas para depilaciones en mis manos?',
            messageId: 'incoming-recommendation',
            type: 'text'
        });

        assert.equal(result.handledBy, 'ai-recommendation-or-doubt');
        assert.equal(geminiMessage, 'Hola que me recomiendas para depilaciones en mis manos?');
        assert.equal(sent[0].type, 'button');
        assert.deepEqual(
            sent[0].buttonPayload.action.buttons.map((button) => button.reply.title),
            ['Agendar cita', 'No gracias']
        );

        const appointmentButtonId = sent[0].buttonPayload.action.buttons[0].reply.id;
        const declineButtonId = sent[0].buttonPayload.action.buttons[1].reply.id;

        sent.length = 0;
        const appointmentResult = await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Mau',
            messageText: appointmentButtonId,
            messageId: 'incoming-recommendation-appointment',
            type: 'interactive'
        });

        assert.equal(appointmentResult.handledBy, 'service-followup-appointment');
        assert.equal(appointmentService?.id, 'depilacion-laser-manos');

        await StateStore.del(`${phoneNumber}:steps`);
        await StateStore.del(`${phoneNumber}:tool`);

        sent.length = 0;
        await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Mau',
            messageText: 'Hola que me recomiendas para depilaciones en mis manos?',
            messageId: 'incoming-recommendation-again',
            type: 'text'
        });

        const declineResult = await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Mau',
            messageText: declineButtonId,
            messageId: 'incoming-recommendation-decline',
            type: 'interactive'
        });

        assert.equal(declineResult.handledBy, 'service-objection-ask');
        assert.equal(sent.at(-1).type, 'button');
        const reasonTitles = sent
            .filter((item) => item.type === 'button')
            .slice(-2)
            .flatMap((item) => item.buttonPayload.action.buttons.map((button) => button.reply.title));
        assert.deepEqual(
            reasonTitles,
            ['Precio', 'Quiero pensarlo', 'No tengo tiempo', 'Comparo opciones']
        );
    } finally {
        Messages.sendMessage = originals.sendMessage;
        Messages.sendTextMessage = originals.sendTextMessage;
        Messages.sendLocalMedia = originals.sendLocalMedia;
        ChatStore.addMessage = originals.addMessage;
        CustomerProfile.rememberName = originals.rememberName;
        CustomerProfile.rememberFromMessage = originals.rememberFromMessage;
        Clients.verifyStoreClient = originals.verifyStoreClient;
        ServiceFollowup.saveOfferState = originals.saveOfferState;
        Gemini.geminiProccess = originals.geminiProccess;
        FlujoCitas.iniciarConServicio = originals.iniciarConServicio;
        await StateStore.del(`${phoneNumber}:steps`);
        await StateStore.del(`${phoneNumber}:tool`);
    }
});

test('catalog-dependent conversation responds gracefully when Supabase catalog is unavailable', async () => {
    const Messages = require('../models/messages');
    const ChatStore = require('../models/chatStore');
    const CustomerProfile = require('../models/customerProfile');
    const Clients = require('../models/clients');
    const ConversationEngine = require('../models/conversationEngine');
    const ServicesRepository = require('../models/servicesRepository');

    const originals = {
        sendTextMessage: Messages.sendTextMessage,
        addMessage: ChatStore.addMessage,
        rememberName: CustomerProfile.rememberName,
        rememberFromMessage: CustomerProfile.rememberFromMessage,
        verifyStoreClient: Clients.verifyStoreClient
    };

    const sent = [];
    CatalogStore.__setTestClient({
        from() {
            return {
                select: async () => ({ data: null, error: new Error('supabase down') })
            };
        }
    });

    Messages.sendTextMessage = async (text, phone) => {
        sent.push({ text, phoneNumber: phone });
    };
    ChatStore.addMessage = () => {};
    CustomerProfile.rememberName = async () => {};
    CustomerProfile.rememberFromMessage = async () => {};
    Clients.verifyStoreClient = async () => {};

    try {
        const result = await ConversationEngine.processIncomingMessage({
            phoneNumber: '5219990000003',
            name: 'Mau',
            messageText: 'Me gustaria informacion de depilacion de medio brazo',
            messageId: 'incoming-catalog-down',
            type: 'text'
        });

        assert.equal(result.handledBy, 'service-catalog-unavailable');
        assert.equal(sent[0].text, ServicesRepository.CATALOG_UNAVAILABLE_MESSAGE);
    } finally {
        Messages.sendTextMessage = originals.sendTextMessage;
        ChatStore.addMessage = originals.addMessage;
        CustomerProfile.rememberName = originals.rememberName;
        CustomerProfile.rememberFromMessage = originals.rememberFromMessage;
        Clients.verifyStoreClient = originals.verifyStoreClient;
        CatalogStore.__setTestClient(createReadOnlySupabaseMock());
    }
});

test('configured conversational phrases match before the AI fallback', () => {
    assert.equal(matchesKeyword('Me puedes compartir la ubicacion por favor', 'ubicacion'), true);
    assert.equal(matchesKeyword('Quiero agendar una cita para manana', 'quiero agendar'), true);
    assert.equal(matchesKeyword('Hola, quiero informacion acerca de sus servicios', 'hola'), false);
    assert.equal(matchesKeyword('category_masajes_extra', 'category_masajes'), false);

    const response = findStepResponse('Cual es su horario de atencion?', 0);
    assert.ok(response);
    assert.ok(response.keywords.includes('horario'));
});

test('free text with a greeting falls through to the AI fallback instead of the welcome menu', async () => {
    const StateStore = require('../models/stateStore');
    const Messages = require('../models/messages');
    const ChatStore = require('../models/chatStore');
    const CustomerProfile = require('../models/customerProfile');
    const Clients = require('../models/clients');
    const Gemini = require('../models/gemini');
    const ConversationEngine = require('../models/conversationEngine');

    const originals = {
        sendMessage: Messages.sendMessage,
        sendTextMessage: Messages.sendTextMessage,
        addMessage: ChatStore.addMessage,
        rememberName: CustomerProfile.rememberName,
        rememberFromMessage: CustomerProfile.rememberFromMessage,
        verifyStoreClient: Clients.verifyStoreClient,
        geminiProccess: Gemini.geminiProccess
    };

    const phoneNumber = '5219990000002';
    const sent = [];
    let geminiMessage = null;

    Messages.sendMessage = async (payload) => {
        sent.push(payload);
        return { data: { messages: [{ id: 'test-message' }] } };
    };
    Messages.sendTextMessage = async (text, phone) => {
        sent.push({ type: 'text', text, phoneNumber: phone });
    };
    ChatStore.addMessage = () => {};
    CustomerProfile.rememberName = async () => {};
    CustomerProfile.rememberFromMessage = async () => {};
    Clients.verifyStoreClient = async () => {};
    Gemini.geminiProccess = async (message) => {
        geminiMessage = message;
    };

    try {
        await StateStore.del(`${phoneNumber}:steps`);
        await StateStore.del(`${phoneNumber}:tool`);

        const result = await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Mau',
            messageText: 'Hola, que cuidados debo tener antes de mi visita?',
            messageId: 'incoming-free-text',
            type: 'text'
        });

        assert.equal(result.handledBy, 'ai-fallback');
        assert.equal(geminiMessage, 'Hola, que cuidados debo tener antes de mi visita?');
        assert.equal(sent.length, 0);
    } finally {
        Messages.sendMessage = originals.sendMessage;
        Messages.sendTextMessage = originals.sendTextMessage;
        ChatStore.addMessage = originals.addMessage;
        CustomerProfile.rememberName = originals.rememberName;
        CustomerProfile.rememberFromMessage = originals.rememberFromMessage;
        Clients.verifyStoreClient = originals.verifyStoreClient;
        Gemini.geminiProccess = originals.geminiProccess;
        await StateStore.del(`${phoneNumber}:steps`);
        await StateStore.del(`${phoneNumber}:tool`);
    }
});

test('appointment date search continues beyond Saturday into the next week', () => {
    const saturday = new Date(2026, 5, 13, 18, 0, 0);
    const dates = getCandidateBusinessDates(saturday, 7);

    assert.equal(dates[0].getDay(), 6);
    assert.equal(dates[1].getDay(), 1);
    assert.ok(dates.length >= 6);
});

test('local appointment overlap detection blocks conflicting slots', () => {
    const start = new Date('2026-06-15T10:00:00-06:00');
    const end = new Date('2026-06-15T11:00:00-06:00');

    assert.equal(
        overlaps(start, end, new Date('2026-06-15T10:30:00-06:00'), new Date('2026-06-15T11:30:00-06:00')),
        true
    );
    assert.equal(
        overlaps(start, end, new Date('2026-06-15T11:00:00-06:00'), new Date('2026-06-15T12:00:00-06:00')),
        false
    );
});

test('configured flow wins even when Gemini mode is active', async () => {
    const StateStore = require('../models/stateStore');
    const Messages = require('../models/messages');
    const ChatStore = require('../models/chatStore');
    const CustomerProfile = require('../models/customerProfile');
    const Clients = require('../models/clients');
    const Gemini = require('../models/gemini');
    const ConversationEngine = require('../models/conversationEngine');

    const originals = {
        sendMessage: Messages.sendMessage,
        sendTextMessage: Messages.sendTextMessage,
        sendLocalMedia: Messages.sendLocalMedia,
        addMessage: ChatStore.addMessage,
        rememberName: CustomerProfile.rememberName,
        rememberFromMessage: CustomerProfile.rememberFromMessage,
        verifyStoreClient: Clients.verifyStoreClient,
        geminiProccess: Gemini.geminiProccess
    };

    const phoneNumber = '5219990000000';
    const sent = [];
    let geminiCalls = 0;

    Messages.sendMessage = async (payload) => {
        sent.push(payload);
        return { data: { messages: [{ id: 'test-message' }] } };
    };
    Messages.sendTextMessage = async (text, phone) => {
        sent.push({ type: 'text', text, phoneNumber: phone });
    };
    Messages.sendLocalMedia = async () => null;
    ChatStore.addMessage = () => {};
    CustomerProfile.rememberName = async () => {};
    CustomerProfile.rememberFromMessage = async () => {};
    Clients.verifyStoreClient = async () => {};
    Gemini.geminiProccess = async () => {
        geminiCalls += 1;
    };

    try {
        await StateStore.set(`${phoneNumber}:tool`, 'gemini', 900);

        const faqResult = await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Prueba',
            messageText: 'Me puedes compartir la ubicacion por favor?',
            messageId: 'incoming-1',
            type: 'text'
        });

        assert.equal(faqResult.handledBy, 'guided-flow');
        assert.equal(geminiCalls, 0);
        assert.match(sent[0].text, /Claustro framboyanes/i);

        sent.length = 0;
        const appointmentResult = await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Prueba',
            messageText: 'menu_appointment',
            messageId: 'incoming-2',
            type: 'interactive'
        });

        assert.equal(appointmentResult.handledBy, 'guided-flow');
        assert.equal(geminiCalls, 0);
        assert.equal(sent[0].type, 'list');

        const categoryId = sent[0].listPayload.action.sections[0].rows[0].id;
        sent.length = 0;
        const categoryResult = await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Prueba',
            messageText: categoryId,
            messageId: 'incoming-3',
            type: 'interactive'
        });
        assert.equal(categoryResult.handledBy, 'conversation-state');
        assert.equal(sent[0].type, 'list');

        const serviceId = sent[0].listPayload.action.sections[0].rows[0].id;
        sent.length = 0;
        await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Prueba',
            messageText: serviceId,
            messageId: 'incoming-4',
            type: 'interactive'
        });
        assert.equal(sent[0].type, 'list');
        const dateId = sent[0].listPayload.action.sections[0].rows[0].id;
        assert.match(dateId, /^appt_date_\d{4}-\d{2}-\d{2}$/);

        sent.length = 0;
        await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Prueba',
            messageText: dateId,
            messageId: 'incoming-5',
            type: 'interactive'
        });
        assert.equal(sent[0].type, 'list');
        const timeId = sent[0].listPayload.action.sections[0].rows[0].id;
        assert.match(timeId, /^appt_time_\d{2}-\d{2}$/);

        sent.length = 0;
        await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Prueba',
            messageText: timeId,
            messageId: 'incoming-6',
            type: 'interactive'
        });
        const peopleId = sent[0].buttonPayload.action.buttons[0].reply.id;
        assert.equal(peopleId, 'appt_people_1');

        sent.length = 0;
        await ConversationEngine.processIncomingMessage({
            phoneNumber,
            name: 'Prueba',
            messageText: peopleId,
            messageId: 'incoming-7',
            type: 'interactive'
        });
        assert.match(sent[0].text, /nombre completo/i);
        assert.equal(geminiCalls, 0);
    } finally {
        Messages.sendMessage = originals.sendMessage;
        Messages.sendTextMessage = originals.sendTextMessage;
        Messages.sendLocalMedia = originals.sendLocalMedia;
        ChatStore.addMessage = originals.addMessage;
        CustomerProfile.rememberName = originals.rememberName;
        CustomerProfile.rememberFromMessage = originals.rememberFromMessage;
        Clients.verifyStoreClient = originals.verifyStoreClient;
        Gemini.geminiProccess = originals.geminiProccess;
        await StateStore.del(`${phoneNumber}:tool`);
        const FlujoCitas = require('../models/citas/flujo');
        await FlujoCitas.reiniciar(phoneNumber);
    }
});
