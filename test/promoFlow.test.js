const test = require('node:test');
const assert = require('node:assert/strict');
const StateManager = require('../models/conversationStateManager');
const ClientesStorage = require('../models/clientes/almacenamiento');
const Messages = require('../models/messages');
const PromoFlow = require('../models/citas/promoFlow');

test('promoFlow opt-in flow tests', async (t) => {
    const originalGetClient = ClientesStorage.getClient;
    const originalSaveClient = ClientesStorage.saveClient;
    const originalSaveState = StateManager.saveState;
    const originalGetActiveState = StateManager.getActiveState;
    const originalClearState = StateManager.clearState;
    const originalSendTextMessage = Messages.sendTextMessage;
    const originalSendMessage = Messages.sendMessage;

    let clientDb = {};
    let states = {};
    let sentMessages = [];

    ClientesStorage.getClient = async (phone) => clientDb[phone] || null;
    ClientesStorage.saveClient = async (client) => {
        clientDb[client.phoneNumber] = client;
        return client;
    };

    StateManager.saveState = async (state) => {
        states[state.phone] = state;
        return state;
    };
    StateManager.getActiveState = async (phone) => states[phone] || null;
    StateManager.clearState = async (phone) => {
        delete states[phone];
        return true;
    };

    Messages.sendTextMessage = async (text, phone) => {
        sentMessages.push({ phone, text, type: 'text' });
        return true;
    };

    Messages.sendMessage = async (payload) => {
        sentMessages.push({
            phone: payload.phoneNumber,
            type: payload.type,
            text: payload.buttonPayload?.body?.text || payload.text,
            buttons: payload.buttonPayload?.action?.buttons
        });
        return true;
    };

    await t.test('iniciarSiAplica skips if client already has both email and birthday day/month', async () => {
        const phone = '5219991112233';
        clientDb[phone] = { phoneNumber: phone, email: 'test@example.com', birthdayDay: 25, birthdayMonth: 12 };
        sentMessages = [];
        states = {};

        const started = await PromoFlow.iniciarSiAplica(phone);
        assert.equal(started, false);
        assert.equal(states[phone], undefined);
        assert.equal(sentMessages.length, 0);
    });

    await t.test('iniciarSiAplica starts flow if client lacks info', async () => {
        const phone = '5219991112233';
        clientDb[phone] = { phoneNumber: phone, email: null, birthdayDay: null, birthdayMonth: null };
        sentMessages = [];
        states = {};

        const started = await PromoFlow.iniciarSiAplica(phone);
        assert.equal(started, true);
        assert.ok(states[phone]);
        assert.equal(states[phone].step, 'invitacion');
        assert.equal(sentMessages.length, 1);
        assert.equal(sentMessages[0].type, 'button');
        assert.match(sentMessages[0].text, /club de beneficios/);
    });

    await t.test('continuar accepts invitation, asks birthday and then email, and saves normalized birthday', async () => {
        const phone = '5219991112233';
        clientDb[phone] = { phoneNumber: phone, email: null, birthdayDay: null, birthdayMonth: null };
        states = {};
        sentMessages = [];

        await PromoFlow.iniciarSiAplica(phone);

        sentMessages = [];
        let handled = await PromoFlow.continuar(phone, 'Si');
        assert.equal(handled, true);
        assert.equal(states[phone].step, 'cumpleanos');
        assert.match(sentMessages[0].text, /cumpleanos/);

        sentMessages = [];
        handled = await PromoFlow.continuar(phone, 'manana');
        assert.equal(handled, true);
        assert.equal(states[phone].step, 'cumpleanos');
        assert.match(sentMessages[0].text, /Por favor escribe/);

        sentMessages = [];
        handled = await PromoFlow.continuar(phone, '25 de diciembre de 1990');
        assert.equal(handled, true);
        assert.equal(states[phone].step, 'email');
        assert.match(sentMessages[0].text, /correo electronico/);

        sentMessages = [];
        handled = await PromoFlow.continuar(phone, 'not-an-email');
        assert.equal(handled, true);
        assert.equal(states[phone].step, 'email');
        assert.match(sentMessages[0].text, /valido/);

        sentMessages = [];
        handled = await PromoFlow.continuar(phone, 'client@example.com');
        assert.equal(handled, true);
        assert.equal(states[phone], undefined);
        assert.match(sentMessages[0].text, /registramos tus datos/);

        assert.equal(clientDb[phone].birthdayDay, 25);
        assert.equal(clientDb[phone].birthdayMonth, 12);
        assert.equal(clientDb[phone].birthday, undefined);
        assert.equal(clientDb[phone].email, 'client@example.com');
    });

    await t.test('parseBirthday normalizes supported formats to day and month only', () => {
        assert.deepEqual(PromoFlow.parseBirthday('25/12'), { day: 25, month: 12 });
        assert.deepEqual(PromoFlow.parseBirthday('25/12/1990'), { day: 25, month: 12 });
        assert.deepEqual(PromoFlow.parseBirthday('25 de diciembre de 1990'), { day: 25, month: 12 });
        assert.equal(PromoFlow.parseBirthday('31/02'), null);
    });

    await t.test('continuar declines invitation, ends flow', async () => {
        const phone = '5219991112233';
        clientDb[phone] = { phoneNumber: phone, email: null, birthdayDay: null, birthdayMonth: null };
        states = {};
        sentMessages = [];

        await PromoFlow.iniciarSiAplica(phone);

        sentMessages = [];
        const handled = await PromoFlow.continuar(phone, 'no gracias');
        assert.equal(handled, true);
        assert.equal(states[phone], undefined);
        assert.match(sentMessages[0].text, /Sin problema/);
    });

    ClientesStorage.getClient = originalGetClient;
    ClientesStorage.saveClient = originalSaveClient;
    StateManager.saveState = originalSaveState;
    StateManager.getActiveState = originalGetActiveState;
    StateManager.clearState = originalClearState;
    Messages.sendTextMessage = originalSendTextMessage;
    Messages.sendMessage = originalSendMessage;
});
