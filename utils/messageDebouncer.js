const ConversationEngine = require('../models/conversationEngine');

const DEFAULT_DEBOUNCE_MS = 3000;
const DEFAULT_MAX_WAIT_MS = 15000;

const toPositiveNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

class MessageDebouncer {
    constructor(options = {}) {
        this.debounceMs = toPositiveNumber(options.debounceMs ?? process.env.MESSAGE_DEBOUNCE_MS, DEFAULT_DEBOUNCE_MS);
        this.maxWaitMs = toPositiveNumber(options.maxWaitMs ?? process.env.MESSAGE_MAX_DEBOUNCE_MS, DEFAULT_MAX_WAIT_MS);
        this.engine = options.engine || ConversationEngine;
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
            this.addTextMessage(recorded);
            return { status: 'debounced' };
        }

        this.flushText(incoming.phoneNumber);
        this.enqueueResponse(recorded);
        return { status: 'queued-interactive' };
    }

    addTextMessage(recorded) {
        const phoneNumber = recorded.phoneNumber;
        const current = this.pendingText.get(phoneNumber);
        const now = Date.now();

        if(!current) {
            const entry = {
                phoneNumber,
                name: recorded.name,
                type: recorded.type,
                firstAt: now,
                messages: [recorded],
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
        this.scheduleTextFlush(current);
    }

    scheduleTextFlush(entry) {
        if(entry.debounceTimer) this.timers.clearTimeout(entry.debounceTimer);
        entry.debounceTimer = this.timers.setTimeout(() => {
            this.flushText(entry.phoneNumber);
        }, this.debounceMs);

        if(!entry.maxTimer && this.maxWaitMs > 0) {
            entry.maxTimer = this.timers.setTimeout(() => {
                this.flushText(entry.phoneNumber);
            }, this.maxWaitMs);
        }
    }

    flushText(phoneNumber) {
        const entry = this.pendingText.get(phoneNumber);
        if(!entry) return null;

        if(entry.debounceTimer) this.timers.clearTimeout(entry.debounceTimer);
        if(entry.maxTimer) this.timers.clearTimeout(entry.maxTimer);
        this.pendingText.delete(phoneNumber);

        const messages = entry.messages || [];
        if(!messages.length) return null;

        const lastMessage = messages[messages.length - 1];
        const combinedText = messages
            .map((message) => String(message.messageText || '').trim())
            .filter(Boolean)
            .join('\n');

        if(!combinedText) return null;

        const payload = {
            phoneNumber,
            name: lastMessage.name || entry.name,
            type: 'text',
            messageText: combinedText,
            messageId: lastMessage.messageId
        };

        this.enqueueResponse(payload);
        return payload;
    }

    enqueueResponse(payload) {
        const phoneNumber = payload.phoneNumber;
        const previous = this.queues.get(phoneNumber) || Promise.resolve();
        const next = previous
            .catch(() => null)
            .then(() => this.engine.respondToIncomingMessage(payload))
            .catch((error) => {
                console.log('Error procesando mensaje en cola', {
                    phoneNumber,
                    error: error.message
                });
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
        Array.from(this.pendingText.keys()).forEach((phoneNumber) => this.flushText(phoneNumber));
        await Promise.allSettled(Array.from(this.queues.values()));
    }
}

const messageDebouncer = new MessageDebouncer();

module.exports = messageDebouncer;
module.exports.MessageDebouncer = MessageDebouncer;
