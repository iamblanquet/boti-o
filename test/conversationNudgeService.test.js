const test = require('node:test');
const assert = require('node:assert/strict');
const Nudge = require('../models/conversationNudgeService');
const StateStore = require('../models/stateStore');
const Messages = require('../models/messages');
const ResponseGuard = require('../utils/responseGuard');

test('only bot questions and interactive messages can schedule a conversation nudge', () => {
    assert.equal(Nudge.isWaitingForReply({ type: 'text', text: '¿Qué día te conviene?', source: 'bot' }), true);
    assert.equal(Nudge.isWaitingForReply({ type: 'button', buttonPayload: { body: {} }, source: 'bot' }), true);
    assert.equal(Nudge.isWaitingForReply({
        type: 'button',
        buttonPayload: { action: { buttons: [{ reply: { id: 'appt_confirm_123' } }] } },
        source: 'bot'
    }), true);
    assert.equal(Nudge.isWaitingForReply({ type: 'text', text: 'Tu cita quedó confirmada.', source: 'bot' }), false);
    assert.equal(Nudge.isWaitingForReply({ type: 'text', text: '¿Cómo seguimos?', source: 'human' }), false);
});

test('sends only one nudge and cancels it when the customer answers', async () => {
    const phoneNumber = '5219990000087';
    const original = Messages.sendTextMessage;
    const sent = [];
    Messages.sendTextMessage = async (...args) => { sent.push(args); return { data: {} }; };
    try {
        await Nudge.recordCustomerMessage(phoneNumber, new Date().toISOString());
        await Nudge.schedule({ phoneNumber, type: 'text', text: '¿Qué servicio te interesa?', source: 'bot' });
        const entry = await Nudge.get(phoneNumber);
        await Nudge.sendDueNudge(phoneNumber, new Date(new Date(entry.dueAt).getTime() + 1));
        await Nudge.sendDueNudge(phoneNumber, new Date(new Date(entry.dueAt).getTime() + 2));
        assert.equal(sent.length, 1);
        assert.match(sent[0][0], /¿Qué servicio te interesa/);
        await Nudge.recordCustomerMessage(phoneNumber, new Date().toISOString());
        assert.equal(await Nudge.get(phoneNumber), null);
    } finally {
        Messages.sendTextMessage = original;
        await StateStore.del(Nudge.key(phoneNumber));
    }
});

test('sends a due nudge even when the originating response token has expired', async () => {
    const phoneNumber = '5219990000084';
    const original = Messages.sendTextMessage;
    const sent = [];
    Messages.sendTextMessage = async (...args) => { sent.push(args); return { data: {} }; };
    try {
        await Nudge.recordCustomerMessage(phoneNumber, new Date().toISOString());
        await Nudge.schedule({ phoneNumber, type: 'text', text: 'Quieres continuar?', source: 'bot' });
        const entry = await Nudge.get(phoneNumber);
        await ResponseGuard.run({
            phoneNumber,
            token: 'expired-token',
            stateKey: `${phoneNumber}:missing-batch`,
            stateStore: StateStore
        }, () => Nudge.sendDueNudge(phoneNumber, new Date(new Date(entry.dueAt).getTime() + 1)));
        assert.equal(sent.length, 1);
    } finally {
        Messages.sendTextMessage = original;
        await Nudge.cancel(phoneNumber);
    }
});

test('re-sends the pending interactive control with the nudge', async () => {
    const phoneNumber = '5219990000086';
    const originalText = Messages.sendTextMessage;
    const originalMessage = Messages.sendMessage;
    const interactive = [];
    const textNudges = [];
    Messages.sendTextMessage = async (...args) => { textNudges.push(args); return { data: {} }; };
    Messages.sendMessage = async (payload) => { interactive.push(payload); return { data: {} }; };
    try {
        await Nudge.recordCustomerMessage(phoneNumber, new Date().toISOString());
        await Nudge.schedule({
            phoneNumber,
            type: 'list',
            source: 'bot',
            listPayload: { type: 'list', body: { text: 'Elige un servicio' }, action: { button: 'Ver servicios', sections: [] } }
        });
        const entry = await Nudge.get(phoneNumber);
        await Nudge.sendDueNudge(phoneNumber, new Date(new Date(entry.dueAt).getTime() + 1));
        assert.equal(interactive.length, 1);
        assert.equal(interactive[0].type, 'list');
        assert.equal(interactive[0].listPayload.action.button, 'Ver servicios');
        assert.equal(interactive[0].listPayload.body.text, '¿Te gustaría continuar? Elige una opción:');
        assert.equal(textNudges.length, 0);
    } finally {
        Messages.sendTextMessage = originalText;
        Messages.sendMessage = originalMessage;
        await StateStore.del(Nudge.key(phoneNumber));
    }
});

test('reminds appointment confirmation without duplicating its action buttons', async () => {
    const phoneNumber = '5219990000085';
    const originalText = Messages.sendTextMessage;
    const originalMessage = Messages.sendMessage;
    const interactive = [];
    Messages.sendTextMessage = async () => ({ data: {} });
    Messages.sendMessage = async (payload) => { interactive.push(payload); return { data: {} }; };
    try {
        await Nudge.recordCustomerMessage(phoneNumber, new Date().toISOString());
        await Nudge.schedule({
            phoneNumber,
            type: 'button',
            source: 'bot',
            buttonPayload: { type: 'button', body: { text: 'Me confirmas tu asistencia?' }, action: { buttons: [{ reply: { id: 'appt_confirm_123', title: 'Confirmo' } }] } }
        });
        const entry = await Nudge.get(phoneNumber);
        await Nudge.sendDueNudge(phoneNumber, new Date(new Date(entry.dueAt).getTime() + 1));
        assert.equal(interactive.length, 0);
    } finally {
        Messages.sendTextMessage = originalText;
        Messages.sendMessage = originalMessage;
        await StateStore.del(Nudge.key(phoneNumber));
    }
});
