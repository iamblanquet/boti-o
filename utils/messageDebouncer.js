const ConversationEngine = require('../models/conversationEngine');
const ChatStore = require('../models/chatStore');
const StateStore = require('../models/stateStore');
const ResponseGuard = require('./responseGuard');

const DEFAULT_DEBOUNCE_MS = 3000;
const DEFAULT_MAX_WAIT_MS = 15000;
const STATE_TTL_SECONDS = 60;

const toPositiveNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

class MessageDebouncer {
    constructor(options = {}) {
        this.debounceMs = toPositiveNumber(options.debounceMs ?? process.env.MESSAGE_DEBOUNCE_MS, DEFAULT_DEBOUNCE_MS);
        this.maxWaitMs = toPositiveNumber(options.maxWaitMs ?? process.env.MESSAGE_MAX_DEBOUNCE_MS, DEFAULT_MAX_WAIT_MS);
        this.engine = options.engine || ConversationEngine;
        this.chatStore = options.chatStore || ChatStore;
        this.stateStore = options.stateStore === undefined ? StateStore : options.stateStore;
        this.timers = options.timers || {
            setTimeout,
            clearTimeout
        };
        this.pendingText = new Map();
        this.queues = new Map();
    }

    isEnabled() {
        return this.debounceMs > 0;
    }

    isTextMessage(incoming) {
        return incoming?.type === 'text';
    }

    async handleIncoming(incoming) {
        if(!incoming?.phoneNumber) return null;

        const recorded = await this.engine.recordIncomingMessage({
            phoneNumber: incoming.phoneNumber,
            name: incoming.name,
            type: incoming.type,
            messageText: incoming.messageText,
            messageId: incoming.messageId
        });

        if(!this.isEnabled()) {
            this.enqueueResponse(recorded);
            return { status: 'queued-immediate' };
        }

        if(this.isTextMessage(incoming)) {
            await this.addTextMessage(recorded);
            return { status: 'debounced' };
        }

        await this.flushText(incoming.phoneNumber);
        this.enqueueResponse(recorded);
        return { status: 'queued-interactive' };
    }

    getStateKey(phoneNumber) {
        return `${phoneNumber}:message_debounce_batch`;
    }

    createToken() {
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    async getSharedBatch(phoneNumber) {
        if(!this.stateStore) return null;
        const raw = await this.stateStore.get(this.getStateKey(phoneNumber));
        if(!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (error) {
            await this.stateStore.del(this.getStateKey(phoneNumber));
            return null;
        }
    }

    async saveSharedBatch(batch) {
        if(!this.stateStore) return;
        await this.stateStore.set(this.getStateKey(batch.phoneNumber), JSON.stringify(batch), STATE_TTL_SECONDS);
    }

    async clearSharedBatch(phoneNumber, token = null) {
        if(!this.stateStore) return;
        if(token) {
            const current = await this.getSharedBatch(phoneNumber);
            if(current?.token !== token) return;
        }
        await this.stateStore.del(this.getStateKey(phoneNumber));
    }

    async addTextMessage(recorded) {
        const phoneNumber = recorded.phoneNumber;
        const current = this.pendingText.get(phoneNumber);
        const now = Date.now();
        const currentShared = await this.getSharedBatch(phoneNumber);
        const token = this.createToken();
        const firstAt = currentShared?.firstAt || recorded.createdAt || new Date(now).toISOString();
        const batch = {
            token,
            phoneNumber,
            name: recorded.name || currentShared?.name || '',
            firstAt,
            lastAt: recorded.createdAt || new Date(now).toISOString(),
            lastMessageId: recorded.messageId,
            updatedAt: new Date(now).toISOString()
        };
        await this.saveSharedBatch(batch);

        if(!current) {
            const entry = {
                phoneNumber,
                name: recorded.name,
                type: recorded.type,
                firstAt: now,
                messages: [recorded],
                token,
                debounceTimer: null,
                maxTimer: null
            };
            this.pendingText.set(phoneNumber, entry);
            this.scheduleTextFlush(entry);
            return;
        }

        current.name = recorded.name || current.name;
        current.type = recorded.type || current.type;
        current.messages.push(recorded);
        current.token = token;
        this.scheduleTextFlush(current);
    }

    scheduleTextFlush(entry) {
        if(entry.debounceTimer) this.timers.clearTimeout(entry.debounceTimer);
        entry.debounceTimer = this.timers.setTimeout(() => {
            this.flushText(entry.phoneNumber, entry.token).catch((error) => {
                console.log('Error vaciando debounce de mensajes', {
                    phoneNumber: entry.phoneNumber,
                    error: error.message
                });
            });
        }, this.debounceMs);

        if(!entry.maxTimer && this.maxWaitMs > 0) {
            entry.maxTimer = this.timers.setTimeout(() => {
                this.flushText(entry.phoneNumber).catch((error) => {
                    console.log('Error vaciando debounce maximo de mensajes', {
                        phoneNumber: entry.phoneNumber,
                        error: error.message
                    });
                });
            }, this.maxWaitMs);
        }
    }

    async buildTextPayloadFromSharedBatch(batch) {
        if(!batch) return null;
        const messages = await this.chatStore.getMessagesAsync(batch.phoneNumber);
        const firstAt = new Date(batch.firstAt).getTime();
        const lastAt = new Date(batch.lastAt).getTime();
        const maxWindowStart = Date.now() - this.maxWaitMs - this.debounceMs - 1000;
        const safeFirstAt = Number.isFinite(firstAt) ? firstAt : maxWindowStart;
        const safeLastAt = Number.isFinite(lastAt) ? lastAt + 1000 : Date.now() + 1000;
        const textMessages = (messages || [])
            .filter((message) => message.direction === 'in' && message.type === 'text')
            .filter((message) => {
                const createdAt = new Date(message.createdAt).getTime();
                return Number.isFinite(createdAt) && createdAt >= safeFirstAt && createdAt <= safeLastAt;
            });

        if(!textMessages.length) return null;

        const lastMessage = textMessages[textMessages.length - 1];
        const combinedText = textMessages
            .map((message) => String(message.text || '').trim())
            .filter(Boolean)
            .join('\n');

        if(!combinedText) return null;

        return {
            phoneNumber: batch.phoneNumber,
            name: batch.name,
            type: 'text',
            messageText: combinedText,
            messageId: batch.lastMessageId || lastMessage.id,
            debounceToken: batch.token,
            debounceStateKey: this.getStateKey(batch.phoneNumber)
        };
    }

    buildTextPayloadFromLocalEntry(entry) {
        const messages = entry?.messages || [];
        if(!messages.length) return null;

        const lastMessage = messages[messages.length - 1];
        const combinedText = messages
            .map((message) => String(message.messageText || '').trim())
            .filter(Boolean)
            .join('\n');

        if(!combinedText) return null;

        return {
            phoneNumber: entry.phoneNumber,
            name: lastMessage.name || entry.name,
            type: 'text',
            messageText: combinedText,
            messageId: lastMessage.messageId,
            debounceToken: entry.token,
            debounceStateKey: this.getStateKey(entry.phoneNumber)
        };
    }

    async flushText(phoneNumber, expectedToken = null) {
        const entry = this.pendingText.get(phoneNumber);
        const sharedBatch = await this.getSharedBatch(phoneNumber);
        const token = expectedToken || entry?.token || sharedBatch?.token || null;

        if(expectedToken && sharedBatch?.token !== expectedToken) return null;
        if(!entry && !sharedBatch) return null;

        if(entry?.debounceTimer) this.timers.clearTimeout(entry.debounceTimer);
        if(entry?.maxTimer) this.timers.clearTimeout(entry.maxTimer);
        this.pendingText.delete(phoneNumber);

        const payload = sharedBatch
            ? await this.buildTextPayloadFromSharedBatch(sharedBatch)
            : this.buildTextPayloadFromLocalEntry(entry);

        if(!payload) return null;
        this.enqueueResponse(payload);
        return payload;
    }

    enqueueResponse(payload) {
        const phoneNumber = payload.phoneNumber;
        const previous = this.queues.get(phoneNumber) || Promise.resolve();
        const runResponse = async () => {
            if(!payload.debounceToken) return this.engine.respondToIncomingMessage(payload);

            return ResponseGuard.run({
                phoneNumber,
                token: payload.debounceToken,
                stateKey: payload.debounceStateKey || this.getStateKey(phoneNumber),
                stateStore: this.stateStore
            }, () => this.engine.respondToIncomingMessage(payload));
        };

        const next = previous
            .catch(() => null)
            .then(runResponse)
            .catch((error) => {
                console.log('Error procesando mensaje en cola', {
                    phoneNumber,
                    error: error.message
                });
            })
            .finally(() => {
                if(payload.debounceToken) return this.clearSharedBatch(phoneNumber, payload.debounceToken);
                return null;
            })
            .finally(() => {
                if(this.queues.get(phoneNumber) === next) {
                    this.queues.delete(phoneNumber);
                }
            });

        this.queues.set(phoneNumber, next);
        return next;
    }

    async flushAll() {
        await Promise.all(Array.from(this.pendingText.keys()).map((phoneNumber) => this.flushText(phoneNumber)));
        await Promise.allSettled(Array.from(this.queues.values()));
    }
}

const messageDebouncer = new MessageDebouncer();

module.exports = messageDebouncer;
module.exports.MessageDebouncer = MessageDebouncer;
