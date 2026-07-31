const StateStore = require('./stateStore');
const Messages = require('./messages');
const Configuration = require('./configuration/repository');
const { DEFAULT_MESSAGES } = require('../utils/systemMessageLoader');

const WELCOME_SEEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const welcomeSeenKey = (phoneNumber) => `${phoneNumber}:welcome_menu_seen`;

const getReturningWelcomeText = async () => {
    const overrides = await Configuration.getSystemMessageOverrides();
    return overrides?.welcome_returning || DEFAULT_MESSAGES.welcome_returning;
};

const withWelcomeText = (buttonPayload, text) => ({
    ...buttonPayload,
    body: {
        ...(buttonPayload?.body || {}),
        text
    }
});

const sendWelcomeMenu = async ({ phoneNumber, messageId, buttonPayload }) => {
    if(!buttonPayload?.action?.buttons?.length) {
        throw new Error('El menu de bienvenida requiere botones configurados.');
    }

    const hasSeenWelcome = Boolean(await StateStore.get(welcomeSeenKey(phoneNumber)));
    const text = hasSeenWelcome
        ? await getReturningWelcomeText()
        : buttonPayload.body?.text;
    const result = await Messages.sendMessage({
        text: '',
        type: 'button',
        phoneNumber,
        messageId,
        buttonPayload: withWelcomeText(buttonPayload, text)
    });

    if(result) await StateStore.set(welcomeSeenKey(phoneNumber), '1', WELCOME_SEEN_TTL_SECONDS);
    return result;
};

module.exports = {
    sendWelcomeMenu,
    welcomeSeenKey,
    WELCOME_SEEN_TTL_SECONDS
};
