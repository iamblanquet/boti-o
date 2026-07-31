const test = require('node:test');
const assert = require('node:assert/strict');
const Nudge = require('../models/conversationNudgeService');
const StateStore = require('../models/stateStore');
const Messages = require('../models/messages');

test('only bot questions and interactive messages can schedule a conversation nudge', () => {
    assert.equal(Nudge.isWaitingForReply({ type: 'text', text: '¿Qué día te conviene?', source: 'bot' }), true);
    assert.equal(Nudge.isWaitingForReply({ type: 'button', buttonPayload: { body: {} }, source: 'bot' }), true);
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
