const normalizeWhatsappRecipient = (phoneNumber) => {
    if(phoneNumber?.startsWith('521') && phoneNumber.length === 13) {
        return `52${phoneNumber.slice(3)}`;
    }
    return phoneNumber;
}

const getIncomingMessageContent = (message) => {
    if(!message) return null;

    if(message.type === 'text') {
        const text = message.text?.body || '';
        return { messageText: text, displayText: text };
    }

    if(message.type === 'button') {
        const messageText = message.button?.payload || message.button?.text || '';
        return {
            messageText,
            displayText: message.button?.text || messageText,
            interactiveReplyId: message.button?.payload || null
        };
    }

    if(message.type === 'interactive') {
        const interactiveType = message.interactive?.type;
        if(interactiveType === 'button_reply') {
            const reply = message.interactive?.button_reply || {};
            const messageText = reply.id || reply.title || '';
            return {
                messageText,
                displayText: reply.title || messageText,
                interactiveReplyId: reply.id || null
            };
        }
        if(interactiveType === 'list_reply') {
            const reply = message.interactive?.list_reply || {};
            const messageText = reply.id || reply.title || '';
            return {
                messageText,
                displayText: reply.title || messageText,
                interactiveReplyId: reply.id || null
            };
        }
    }

    return null;
}

const parseIncomingMessage = (requestBody) => {
    const change = requestBody?.entry?.[0]?.changes?.[0];
    const contacts = change?.value?.contacts || [];
    const messages = change?.value?.messages || [];
    const message = messages[0];
    if(!message) return null;

    const content = getIncomingMessageContent(message);
    if(content === null) {
        return {
            unsupportedType: message.type
        };
    }

    const contact = contacts[0] || {};
    const phoneNumber = message.from;
    const whatsappNumber = normalizeWhatsappRecipient(contact.wa_id || phoneNumber);

    return {
        phoneNumber: whatsappNumber,
        rawPhoneNumber: phoneNumber,
        waId: contact.wa_id,
        name: contact.profile?.name,
        type: message.type,
        messageText: content.messageText,
        displayText: content.displayText,
        interactiveReplyId: content.interactiveReplyId,
        messageId: message.id
    };
}

module.exports = {
    normalizeWhatsappRecipient,
    getIncomingMessageContent,
    parseIncomingMessage
};
