const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConversationFlow, validateSystemMessages } = require('../models/configuration/validators');
const { getMessage } = require('../utils/systemMessageLoader');
const Messages = require('../models/messages');
const { sendAppointmentConfirmationCare } = require('../models/citas/confirmacionCancelacion');

test('configuration validators accept a valid conversation flow', () => {
    const flow = [{ step: '0', keywords: ['hola'], response: ['Hola'] }];
    assert.equal(validateConversationFlow(flow), flow);
});

test('configuration validators reject malformed flow and missing placeholders', () => {
    assert.throws(() => validateConversationFlow([{ keywords: ['hola'] }]), /step/);
    assert.throws(
        () => validateSystemMessages({ booking_success: 'Cita creada' }, { booking_success: '{{service}} {{datetime}}' }),
        /{{service}}/
    );
    assert.throws(
        () => validateSystemMessages({ welcome_returning: '   ' }),
        /no puede estar vacio/
    );
});

test('appointment confirmation care message is available and configurable', () => {
    assert.match(getMessage('appointment_confirmation_care'), /Llegar entre 10 y 15 minutos antes/i);
    assert.match(getMessage('appointment_post_care'), /mantenerte bien hidratado/i);
    assert.equal(
        validateSystemMessages({ appointment_confirmation_care: 'Recuerda llegar con tiempo.' }, {}).appointment_confirmation_care,
        'Recuerda llegar con tiempo.'
    );
});

test('appointment confirmation sends the configurable care message', async () => {
    const originalSendTextMessage = Messages.sendTextMessage;
    const sent = [];
    Messages.sendTextMessage = async (text, phoneNumber) => sent.push({ text, phoneNumber });

    try {
        await sendAppointmentConfirmationCare('5219990000000');
        assert.equal(sent.length, 1);
        assert.equal(sent[0].phoneNumber, '5219990000000');
        assert.match(sent[0].text, /Usar ropa cómoda/i);
    } finally {
        Messages.sendTextMessage = originalSendTextMessage;
    }
});
