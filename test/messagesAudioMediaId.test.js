const test = require('node:test');
const assert = require('node:assert/strict');

const loadMessagesWithMocks = () => {
    const messagesPath = require.resolve('../models/messages');
    const axiosPath = require.resolve('axios');
    const whatsappPath = require.resolve('../config/whatsapp');
    const chatStorePath = require.resolve('../models/chatStore');
    const customerProfilePath = require.resolve('../models/customerProfile');
    const funnelPath = require.resolve('../models/campaigns/funnelService');

    const previous = {
        messages: require.cache[messagesPath],
        axios: require.cache[axiosPath],
        whatsapp: require.cache[whatsappPath],
        chatStore: require.cache[chatStorePath],
        customerProfile: require.cache[customerProfilePath],
        funnel: require.cache[funnelPath]
    };

    const calls = {};
    delete require.cache[messagesPath];

    require.cache[axiosPath] = {
        id: axiosPath,
        filename: axiosPath,
        loaded: true,
        exports: {
            post: async (url, body, config) => {
                calls.post = { url, body, config };
                return { data: { messages: [{ id: 'wamid.test' }] } };
            }
        }
    };
    require.cache[whatsappPath] = {
        id: whatsappPath,
        filename: whatsappPath,
        loaded: true,
        exports: {
            getMessagesUrl: () => 'https://graph.test/messages',
            getHeaders: () => ({ Authorization: 'Bearer token', 'Content-Type': 'application/json' })
        }
    };
    require.cache[chatStorePath] = {
        id: chatStorePath,
        filename: chatStorePath,
        loaded: true,
        exports: {
            addMessage: async (message) => {
                calls.addMessage = message;
                return message;
            }
        }
    };
    require.cache[customerProfilePath] = {
        id: customerProfilePath,
        filename: customerProfilePath,
        loaded: true,
        exports: { personalizeText: async (_phone, text) => text }
    };
    require.cache[funnelPath] = {
        id: funnelPath,
        filename: funnelPath,
        loaded: true,
        exports: { markContacted: async () => null }
    };

    const Messages = require('../models/messages');

    return {
        Messages,
        calls,
        cleanup: () => {
            delete require.cache[messagesPath];
            Object.entries({
                [axiosPath]: previous.axios,
                [whatsappPath]: previous.whatsapp,
                [chatStorePath]: previous.chatStore,
                [customerProfilePath]: previous.customerProfile,
                [funnelPath]: previous.funnel
            }).forEach(([path, cacheEntry]) => {
                if (cacheEntry) require.cache[path] = cacheEntry;
                else delete require.cache[path];
            });
            if (previous.messages) require.cache[messagesPath] = previous.messages;
        }
    };
};

test('sendMessage sends dashboard audio by WhatsApp media id when available', async () => {
    const { Messages, calls, cleanup } = loadMessagesWithMocks();

    try {
        await Messages.sendMessage({
            phoneNumber: '5219990000000',
            type: 'audio',
            source: 'human',
            text: 'https://public.test/audio.ogg',
            mediaId: 'media-123'
        });

        assert.equal(calls.post.body.type, 'audio');
        assert.deepEqual(calls.post.body.audio, { id: 'media-123' });
        assert.equal(calls.addMessage.type, 'audio');
        assert.equal(calls.addMessage.text, 'https://public.test/audio.ogg');
    } finally {
        cleanup();
    }
});

test('sendMessage can mark audio media id as a WhatsApp voice message', async () => {
    const { Messages, calls, cleanup } = loadMessagesWithMocks();

    try {
        await Messages.sendMessage({
            phoneNumber: '5219990000000',
            type: 'audio',
            source: 'human',
            text: 'https://public.test/audio.ogg',
            mediaId: 'media-voice-123',
            voice: true
        });

        assert.equal(calls.post.body.type, 'audio');
        assert.deepEqual(calls.post.body.audio, { id: 'media-voice-123', voice: true });
        assert.equal(calls.addMessage.type, 'audio');
        assert.equal(calls.addMessage.text, 'https://public.test/audio.ogg');
    } finally {
        cleanup();
    }
});

test('sendMessage sends an image by WhatsApp media id when available', async () => {
    const { Messages, calls, cleanup } = loadMessagesWithMocks();

    try {
        await Messages.sendMessage({
            phoneNumber: '5219990000000',
            type: 'image',
            source: 'bot',
            text: '',
            mediaId: 'service-image-123'
        });

        assert.equal(calls.post.body.type, 'image');
        assert.deepEqual(calls.post.body.image, { id: 'service-image-123' });
    } finally {
        cleanup();
    }
});
