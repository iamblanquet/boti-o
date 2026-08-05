const test = require('node:test');
const assert = require('node:assert/strict');
const { formatPeoplePrices } = require('../models/responseTemplates');

test('service price with identical people tiers is presented once', () => {
    assert.equal(formatPeoplePrices({
        precio: 800,
        preciosPersonas: [
            { personas: 1, precio: 800 },
            { personas: 2, precio: 800 },
            { personas: 3, precio: 800 }
        ]
    }), '$800');
});

test('service price with special tiers retains the people breakdown', () => {
    assert.equal(formatPeoplePrices({
        preciosPersonas: [
            { personas: 1, precio: 800 },
            { personas: 2, precio: 1400, exclusivo: true }
        ]
    }), '1 persona: $800 / 2 personas: $1,400 (exclusivo)');
});
