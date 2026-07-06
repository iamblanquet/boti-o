const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageDebouncer } = require('../utils/messageDebouncer');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createEngineMock = () => {
    const calls = {
        recorded: [],
        responses: []
    };

    return {
        calls,
        async recordIncomingMessage(payload) {
            calls.recorded.push(payload);
            return {
                ...payload,
                messageText: String(payload.messageText || '').trim()
            };
        },
        async respondToIncomingMessage(payload) {
            calls.responses.push(payload);
            return { handledBy: 'test' };
        }
    };
}

test('debounces consecutive text messages into one response payload', async () => {
    const engine = createEngineMock();
    const debouncer = new MessageDebouncer({
        engine,
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
