const test = require('node:test');
const assert = require('node:assert/strict');

const loadCalendarInviteWithAxios = (axiosMock) => {
    const calendarPath = require.resolve('../utils/calendarInvite');
    const axiosPath = require.resolve('axios');
    const previousAxios = require.cache[axiosPath];

    delete require.cache[calendarPath];
    require.cache[axiosPath] = {
        id: axiosPath,
        filename: axiosPath,
        loaded: true,
        exports: axiosMock
    };

    const calendarInvite = require('../utils/calendarInvite');

    return {
        calendarInvite,
        cleanup: () => {
            delete require.cache[calendarPath];
            if(previousAxios) require.cache[axiosPath] = previousAxios;
            else delete require.cache[axiosPath];
        }
    };
};

test('shortenUrl uses an external URL shortener and returns the short URL', async () => {
    const calls = [];
    const { calendarInvite, cleanup } = loadCalendarInviteWithAxios({
        get: async (url) => {
            calls.push(url);
            return { data: 'https://is.gd/abc123' };
        }
    });

    try {
        const shortUrl = await calendarInvite.shortenUrl('https://calendar.google.com/calendar/render?action=TEMPLATE');

        assert.equal(shortUrl, 'https://is.gd/abc123');
        assert.equal(calls.length, 1);
        assert.match(calls[0], /^https:\/\/is\.gd\/create\.php\?format=simple&url=/);
    } finally {
        cleanup();
    }
});

test('shortenUrl falls back to the next external service when the first one fails', async () => {
    const calls = [];
    const { calendarInvite, cleanup } = loadCalendarInviteWithAxios({
        get: async (url) => {
            calls.push(url);
            if(calls.length === 1) throw new Error('service unavailable');
            return { data: 'https://v.gd/fallback1' };
        }
    });

    try {
        const shortUrl = await calendarInvite.shortenUrl('https://calendar.google.com/calendar/render?action=TEMPLATE');

        assert.equal(shortUrl, 'https://v.gd/fallback1');
        assert.equal(calls.length, 2);
        assert.match(calls[1], /^https:\/\/v\.gd\/create\.php\?format=simple&url=/);
    } finally {
        cleanup();
    }
});
