const test = require('node:test');
const assert = require('node:assert/strict');

const WelcomeMenu = require('../models/welcomeMenuService');
const StateStore = require('../models/stateStore');
const Messages = require('../models/messages');
const Configuration = require('../models/configuration/repository');

const menuPayload = {
    type: 'button',
    body: { text: 'Texto anterior que no debe enviarse' },
    action: {
        buttons: [
            { type: 'reply', reply: { id: 'menu_services', title: 'Servicios' } },
            { type: 'reply', reply: { id: 'menu_appointment', title: 'Agendar cita' } },
            { type: 'reply', reply: { id: 'menu_ai', title: 'Tengo una duda' } }
        ]
    }
};

test('welcome menu sends configured first and returning texts with the same menu buttons', async () => {
    const phoneNumber = '5219990000099';
    const sent = [];
    const originals = {
        sendMessage: Messages.sendMessage,
        getSystemMessageOverrides: Configuration.getSystemMessageOverrides
    };

    Messages.sendMessage = async (payload) => {
        sent.push(payload);
        return { data: { messages: [{ id: 'outgoing-message' }] } };
    };
    Configuration.getSystemMessageOverrides = async () => ({ welcome_returning: 'Qué gusto tenerte de nuevo.' });

    try {
        await StateStore.del(WelcomeMenu.welcomeSeenKey(phoneNumber));

        await WelcomeMenu.sendWelcomeMenu({ phoneNumber, messageId: 'first', buttonPayload: menuPayload });
        await WelcomeMenu.sendWelcomeMenu({ phoneNumber, messageId: 'returning', buttonPayload: menuPayload });

        assert.equal(sent.length, 2);
        assert.equal(sent[0].buttonPayload.body.text, 'Texto anterior que no debe enviarse');
        assert.equal(sent[1].buttonPayload.body.text, 'Qué gusto tenerte de nuevo.');
        assert.deepEqual(sent[0].buttonPayload.action.buttons, menuPayload.action.buttons);
        assert.deepEqual(sent[1].buttonPayload.action.buttons, menuPayload.action.buttons);
        assert.equal(menuPayload.body.text, 'Texto anterior que no debe enviarse');
    } finally {
        Messages.sendMessage = originals.sendMessage;
        Configuration.getSystemMessageOverrides = originals.getSystemMessageOverrides;
        await StateStore.del(WelcomeMenu.welcomeSeenKey(phoneNumber));
    }
});

test('welcome menu only marks the contact after an outgoing message is sent', async () => {
    const phoneNumber = '5219990000098';
    const originalSendMessage = Messages.sendMessage;
    const originalGetOverrides = Configuration.getSystemMessageOverrides;
    Messages.sendMessage = async () => null;
    Configuration.getSystemMessageOverrides = async () => ({});

    try {
        await StateStore.del(WelcomeMenu.welcomeSeenKey(phoneNumber));
        await WelcomeMenu.sendWelcomeMenu({ phoneNumber, buttonPayload: menuPayload });
        assert.equal(await StateStore.get(WelcomeMenu.welcomeSeenKey(phoneNumber)), null);
    } finally {
        Messages.sendMessage = originalSendMessage;
        Configuration.getSystemMessageOverrides = originalGetOverrides;
        await StateStore.del(WelcomeMenu.welcomeSeenKey(phoneNumber));
    }
});
