const Messages = require('../messages');

const MAX_BUTTONS_PER_MESSAGE = 3;

const truncateListText = (value, maxLength) => {
    const text = String(value || '').trim();
    if(text.length <= maxLength) return text;
    if(maxLength <= 3) return text.slice(0, maxLength);
    return `${text.slice(0, maxLength - 3).trim()}...`;
}

const cleanServiceTitle = (value) => String(value || '')
    .replace(/^Depilaci[oó]n L[aá]ser -\s*/i, '')
    .replace(/^Depilaci[oÃ³]n L[aÃ¡]ser -\s*/i, '')
    .trim();



const sendButtonMessage = (phoneNumber, text, buttons) => Messages.sendMessage({
    phoneNumber,
    type: 'button',
    buttonPayload: {
        type: 'button',
        body: { text },
        action: {
            buttons: buttons.map((button) => ({
                type: 'reply',
                reply: {
                    id: button.id,
                    title: button.title
                }
            }))
        }
    }
});

const sendButtonGroups = async (phoneNumber, text, buttons) => {
    if(!buttons.length) return false;

    for(let index = 0; index < buttons.length; index += MAX_BUTTONS_PER_MESSAGE) {
        await sendButtonMessage(
            phoneNumber,
            index === 0 ? text : 'Tambien tengo estas opciones:',
            buttons.slice(index, index + MAX_BUTTONS_PER_MESSAGE)
        );
    }

    return true;
}

const sendListMessage = (phoneNumber, { body, button, sectionTitle, rows, sections }) => Messages.sendMessage({
    phoneNumber,
    type: 'list',
    text: body,
    listPayload: {
        type: 'list',
        body: { text: body },
        action: {
            button: truncateListText(button, 20),
            sections: sections || [{
                title: truncateListText(sectionTitle, 24),
                rows
            }]
        }
    }
});

module.exports = {
    truncateListText,
    cleanServiceTitle,

    sendButtonMessage,
    sendButtonGroups,
    sendListMessage
};
