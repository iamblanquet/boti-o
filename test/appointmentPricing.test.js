const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getAllowedPeopleOptions,
    getPriceForPeople,
    isPeopleAllowed
} = require('../models/citas/precios');
const Messages = require('../models/messages');
const { sendPeopleButtons } = require('../models/citas/preguntas');

const exclusivePairPrice = [{ personas: 2, precio: 1499, exclusivo: true }];

test('exclusive service pricing only permits its configured number of people', () => {
    assert.deepEqual(getAllowedPeopleOptions(exclusivePairPrice), [2]);
    assert.equal(isPeopleAllowed(exclusivePairPrice, 1), false);
    assert.equal(isPeopleAllowed(exclusivePairPrice, 2), true);
    assert.equal(isPeopleAllowed(exclusivePairPrice, 3), false);
    assert.equal(getPriceForPeople(exclusivePairPrice, 2), 1499);
});

test('configured price tiers allow only their configured quantities', () => {
    const tiers = [
        { personas: 1, precio: 350, exclusivo: false },
        { personas: 2, precio: 600, exclusivo: true }
    ];

    assert.deepEqual(getAllowedPeopleOptions(tiers), [1, 2]);
    assert.equal(getPriceForPeople(tiers, 1), 350);
    assert.equal(getPriceForPeople(tiers, 2), 600);
    assert.equal(isPeopleAllowed(tiers, 3), false);
});

test('appointment people selector only shows the exclusive allowed option', async () => {
    const originalSendMessage = Messages.sendMessage;
    const sent = [];
    Messages.sendMessage = async (payload) => {
        sent.push(payload);
        return true;
    };

    try {
        await sendPeopleButtons('5219990000000', {
            serviceName: 'Soft Harmony',
            personPrices: exclusivePairPrice
        });

        assert.deepEqual(
            sent[0].buttonPayload.action.buttons.map((button) => button.reply.id),
            ['appt_people_2']
        );
        assert.match(sent[0].buttonPayload.body.text, /disponible para 2 personas/i);
    } finally {
        Messages.sendMessage = originalSendMessage;
    }
});
