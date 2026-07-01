const normalizeWhatsappRecipient = (phoneNumber) => {
    if(phoneNumber?.startsWith('521') && phoneNumber.length === 13) {
        return `52${phoneNumber.slice(3)}`;
    }
    return phoneNumber;
}

const getIncomingText = (message) => {
    if(!message) return null;

    if(message.type === 'text') return message.text?.body || '';

    if(message.type === 'button') {
        return message.button?.payload || message.button?.text || '';
    }

    if(message.type === 'interactive') {
        const interactiveType = message.interactive?.type;
        if(interactiveType === 'button_reply') {
            return message.interactive?.button_reply?.id || message.interactive?.button_reply?.title || '';
        }
        if(interactiveType === 'list_reply') {
            return message.interactive?.list_reply?.id || message.interactive?.list_reply?.title || '';
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

    const messageText = getIncomingText(message);
    if(messageText === null) {
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
        messageText,
        messageId: message.id
    };
}

module.exports = {
    normalizeWhatsappRecipient,
    parseIncomingMessage
};
