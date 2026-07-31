const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConversationFlow, validateSystemMessages } = require('../models/configuration/validators');

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
    assert.doesNotThrow(() => validateSystemMessages(
        { welcome_first_time: 'Bienvenida sin nombre personalizado.' },
        { welcome_first_time: 'Hola {{name}}' }
    ));
});
