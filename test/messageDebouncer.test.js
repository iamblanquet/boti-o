const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageDebouncer } = require('../utils/messageDebouncer');
const ResponseGuard = require('../utils/responseGuard');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createEngineMock = () => {
    const calls = {
        recorded: [],
        responses: []
    };

    return {
        calls,
        async recordIncomingMessage(payload) {
            const recorded = {
                ...payload,
                messageText: String(payload.messageText || '').trim(),
                createdAt: new Date().toISOString()
            };
            calls.recorded.push(recorded);
            return {
                ...recorded
            };
        },
        async respondToIncomingMessage(payload) {
            calls.responses.push(payload);
            return { handledBy: 'test' };
        }
    };
}

const createStateStoreMock = () => {
    const values = new Map();
    return {
        async get(key) {
            return values.get(key) || null;
        },
        async set(key, value) {
            values.set(key, String(value));
        },
        async del(key) {
            values.delete(key);
        }
    };
}

const createChatStoreMock = (engine) => ({
    async getMessagesAsync(phoneNumber) {
        return engine.calls.recorded
            .filter((message) => message.phoneNumber === phoneNumber)
            .map((message) => ({
                id: message.messageId,
                phoneNumber: message.phoneNumber,
                direction: 'in',
                type: message.type,
                text: message.messageText,
                createdAt: message.createdAt
            }));
    }
});

test('debounces consecutive text messages into one response payload', async () => {
    const engine = createEngineMock();
    const debouncer = new MessageDebouncer({
        engine,
        chatStore: createChatStoreMock(engine),
        stateStore: createStateStoreMock(),
        debounceMs: 20,
        maxWaitMs: 100
    });

    await debouncer.handleIncoming({
        phoneNumber: '5219990000001',
        name: 'Carola',
        type: 'text',
        messageText: 'hola',
        messageId: 'm1'
    });
    await debouncer.handleIncoming({
        phoneNumber: '5219990000001',
        name: 'Carola',
        type: 'text',
        messageText: 'quiero pedir',
        messageId: 'm2'
    });
    await debouncer.handleIncoming({
        phoneNumber: '5219990000001',
        name: 'Carola',
        type: 'text',
        messageText: 'ahora',
        messageId: 'm3'
    });

    await sleep(35);
    await debouncer.flushAll();

    assert.equal(engine.calls.recorded.length, 3);
    assert.equal(engine.calls.responses.length, 1);
    assert.equal(engine.calls.responses[0].messageText, 'hola\nquiero pedir\nahora');
    assert.equal(engine.calls.responses[0].messageId, 'm3');
});

test('processes immediately when debounce is disabled', async () => {
    const engine = createEngineMock();
    const debouncer = new MessageDebouncer({
        engine,
        chatStore: createChatStoreMock(engine),
        stateStore: createStateStoreMock(),
        debounceMs: 0,
        maxWaitMs: 100
    });

    await debouncer.handleIncoming({
        phoneNumber: '5219990000002',
        name: 'Mau',
        type: 'text',
        messageText: 'hola',
        messageId: 'm1'
    });
    await debouncer.handleIncoming({
        phoneNumber: '5219990000002',
        name: 'Mau',
        type: 'text',
        messageText: 'servicios',
        messageId: 'm2'
    });
    await debouncer.flushAll();

    assert.equal(engine.calls.recorded.length, 2);
    assert.equal(engine.calls.responses.length, 2);
    assert.deepEqual(
        engine.calls.responses.map((payload) => payload.messageText),
        ['hola', 'servicios']
    );
});

test('flushes pending text before interactive messages and preserves order', async () => {
    const engine = createEngineMock();
    const debouncer = new MessageDebouncer({
        engine,
        chatStore: createChatStoreMock(engine),
        stateStore: createStateStoreMock(),
        debounceMs: 100,
        maxWaitMs: 500
    });

    await debouncer.handleIncoming({
        phoneNumber: '5219990000003',
        name: 'Ana',
        type: 'text',
        messageText: 'quiero cita',
        messageId: 'text-1'
    });
    await debouncer.handleIncoming({
        phoneNumber: '5219990000003',
        name: 'Ana',
        type: 'interactive',
        messageText: 'menu_appointment',
        messageId: 'button-1'
    });
    await debouncer.flushAll();

    assert.equal(engine.calls.recorded.length, 2);
    assert.equal(engine.calls.responses.length, 2);
    assert.equal(engine.calls.responses[0].messageText, 'quiero cita');
    assert.equal(engine.calls.responses[1].messageText, 'menu_appointment');
});

test('preserves interactive display text separately from its technical reply id', async () => {
    const engine = createEngineMock();
    const debouncer = new MessageDebouncer({
        engine,
        chatStore: createChatStoreMock(engine),
        stateStore: createStateStoreMock(),
        debounceMs: 20,
        maxWaitMs: 100
    });

    await debouncer.handleIncoming({
        phoneNumber: '5219990000010',
        name: 'Ana',
        type: 'interactive',
        messageText: 'appt_manage_cancel_yes_4ba6420e-b53c-4233-a488-68bc20004953',
        displayText: 'Si, cancelar',
        interactiveReplyId: 'appt_manage_cancel_yes_4ba6420e-b53c-4233-a488-68bc20004953',
        messageId: 'button-confirm-cancel'
    });
    await debouncer.flushAll();

    assert.equal(engine.calls.recorded[0].messageText, 'appt_manage_cancel_yes_4ba6420e-b53c-4233-a488-68bc20004953');
    assert.equal(engine.calls.recorded[0].displayText, 'Si, cancelar');
    assert.equal(engine.calls.recorded[0].interactiveReplyId, 'appt_manage_cancel_yes_4ba6420e-b53c-4233-a488-68bc20004953');
    assert.equal(engine.calls.responses[0].messageText, 'appt_manage_cancel_yes_4ba6420e-b53c-4233-a488-68bc20004953');
});

test('ignores stale text timers when a newer batch token exists', async () => {
    const engine = createEngineMock();
    const stateStore = createStateStoreMock();
    const debouncer = new MessageDebouncer({
        engine,
        chatStore: createChatStoreMock(engine),
        stateStore,
        debounceMs: 100,
        maxWaitMs: 500
    });

    await debouncer.handleIncoming({
        phoneNumber: '5219990000004',
        name: 'Luis',
        type: 'text',
        messageText: 'hola',
        messageId: 'm1'
    });
    const firstBatch = await debouncer.getSharedBatch('5219990000004');

    await debouncer.handleIncoming({
        phoneNumber: '5219990000004',
        name: 'Luis',
        type: 'text',
        messageText: 'quiero informacion',
        messageId: 'm2'
    });

    const staleFlush = await debouncer.flushText('5219990000004', firstBatch.token);
    assert.equal(staleFlush, null);

    await debouncer.flushAll();

    assert.equal(engine.calls.responses.length, 1);
    assert.equal(engine.calls.responses[0].messageText, 'hola\nquiero informacion');
});

test('marks an in-flight response as stale when a newer text batch arrives', async () => {
    const engine = createEngineMock();
    const stateStore = createStateStoreMock();
    let releaseFirstResponse;
    let firstResponseStarted;
    const firstStarted = new Promise((resolve) => {
        firstResponseStarted = resolve;
    });
    const releaseFirst = new Promise((resolve) => {
        releaseFirstResponse = resolve;
    });

    let responseCount = 0;
    engine.respondToIncomingMessage = async (payload) => {
        responseCount += 1;
        if(responseCount === 1) {
            firstResponseStarted();
            await releaseFirst;
        }

        engine.calls.responses.push({
            ...payload,
            canSend: await ResponseGuard.shouldSend({ phoneNumber: payload.phoneNumber })
        });
        return { handledBy: 'test' };
    };

    const debouncer = new MessageDebouncer({
        engine,
        chatStore: createChatStoreMock(engine),
        stateStore,
        debounceMs: 20,
        maxWaitMs: 500
    });

    await debouncer.handleIncoming({
        phoneNumber: '5219990000005',
        name: 'Sofia',
        type: 'text',
        messageText: 'quiero',
        messageId: 'm1'
    });

    await firstStarted;

    await debouncer.handleIncoming({
        phoneNumber: '5219990000005',
        name: 'Sofia',
        type: 'text',
        messageText: 'informacion de depilacion de manos',
        messageId: 'm2'
    });

    releaseFirstResponse();
    await sleep(35);
    await debouncer.flushAll();

    assert.equal(engine.calls.responses.length, 2);
    assert.equal(engine.calls.responses[0].messageText, 'quiero');
    assert.equal(engine.calls.responses[0].canSend, false);
    assert.equal(engine.calls.responses[1].messageText, 'quiero\ninformacion de depilacion de manos');
    assert.equal(engine.calls.responses[1].canSend, true);
});
