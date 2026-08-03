const test = require('node:test');
const assert = require('node:assert/strict');
const { parseIncomingMessage } = require('../utils/whatsappWebhookParser');

const parseMessage = (message) => parseIncomingMessage({
    entry: [{ changes: [{ value: {
        contacts: [{ wa_id: '5219990000001', profile: { name: 'Ana' } }],
        messages: [{ id: 'wamid.test', from: '5219990000001', ...message }]
    } }] }]
});

test('interactive button keeps its technical id while exposing its selected title', () => {
    const incoming = parseMessage({
        type: 'interactive',
        interactive: {
            type: 'button_reply',
            button_reply: {
                id: 'appt_manage_cancel_yes_39b83beb-dbbe-42f8-b18c-678bd9ddec46',
                title: 'Si, cancelar'
            }
        }
    });

    assert.equal(incoming.messageText, 'appt_manage_cancel_yes_39b83beb-dbbe-42f8-b18c-678bd9ddec46');
    assert.equal(incoming.displayText, 'Si, cancelar');
    assert.equal(incoming.interactiveReplyId, incoming.messageText);
});

test('interactive list keeps its technical id while exposing its selected title', () => {
    const incoming = parseMessage({
        type: 'interactive',
        interactive: {
            type: 'list_reply',
            list_reply: { id: 'service_masaje-relajante', title: 'Masaje Relajante' }
        }
    });

    assert.equal(incoming.messageText, 'service_masaje-relajante');
    assert.equal(incoming.displayText, 'Masaje Relajante');
    assert.equal(incoming.interactiveReplyId, 'service_masaje-relajante');
});
