const StateStore = require('./stateStore');
const Messages = require('./messages');
const stepsResponses = require('../helpers/thessaResponses.json');
const { normalizeText } = require('../utils/configCitas');

const normalizeMessage = (value) => normalizeText(value)
    .replace(/[^a-z0-9_ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isPayloadKeyword = (keyword) => keyword.includes('_');
const EXACT_KEYWORDS = new Set([
    'hola',
    'buenas',
    'buenos dias',
    'buenas tardes',
    'menu',
    'inicio',
    'ayuda'
]);

const matchesKeyword = (message, keyword) => {
    const normalizedMessage = normalizeMessage(message);
    const normalizedKeyword = normalizeMessage(keyword);
    if(!normalizedMessage || !normalizedKeyword) return false;
    if(normalizedMessage === normalizedKeyword) return true;
    if(isPayloadKeyword(normalizedKeyword) || EXACT_KEYWORDS.has(normalizedKeyword)) return false;

    return (` ${normalizedMessage} `).includes(` ${normalizedKeyword} `);
}

const findStepResponse = (message, step) => stepsResponses.find((item) => {
    const previousStep = item.previousStep ?? item.previusStep;
    return Number(previousStep) === Number(step) &&
        item.keywords.some((keyword) => matchesKeyword(message, keyword));
});

const setActiveTool = async (phoneNumber, tool) => {
    const activeToolKey = `${phoneNumber}:tool`;
    const stepsKey = `${phoneNumber}:steps`;
    const ttlSeconds = Number(process.env.AI_MODE_TTL_SECONDS || 15 * 60);
    await StateStore.set(activeToolKey, tool, ttlSeconds);
    await StateStore.del(stepsKey);
}

const sendMessageSteps = async (message, phoneNumber, messageId) => {
    const inactiveClientKey = `${phoneNumber}:inactive`;
    const inactiveClientRedis = await StateStore.get(inactiveClientKey);
    if(inactiveClientRedis) return 'Client inactive';

    const stepsKey = `${phoneNumber}:steps`;
    let step = 0;
    const isGreetingCommand = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'inicio', 'ayuda'].includes(message);
    if(message === 'menu' || isGreetingCommand) {
        await StateStore.del(stepsKey);
    } else {
        step = await StateStore.get(stepsKey) || 0;
    }

    const key = findStepResponse(message, step);
    if(!key) return false;

    const {
        response,
        type,
        document,
        location,
        buttonPayload,
        listPayload,
        localFile
    } = key;

    if(key.function === 'gemini') {
        await setActiveTool(phoneNumber, 'gemini');
        await Messages.sendTextMessage(response.join(''), phoneNumber);
        return true;
    }

    if(key.function === 'appointment') {
        const FlujoCitas = require('./citas/flujo');
        await StateStore.del(`${phoneNumber}:tool`);
        await StateStore.del(stepsKey);
        if(message === 'menu_appointment') {
            await FlujoCitas.preparar(phoneNumber);
        } else {
            await FlujoCitas.iniciar(phoneNumber, message);
        }
        return true;
    }

    if(key.function === 'appointment_management') {
        const FlujoCitas = require('./citas/flujo');
        await StateStore.del(`${phoneNumber}:tool`);
        await StateStore.del(stepsKey);
        const handled = await FlujoCitas.continuar(phoneNumber, message);
        if(handled) return true;
    }

    if(key.function === 'catalog') {
        const CatalogMenu = require('./catalogMenu');
        await StateStore.del(`${phoneNumber}:tool`);
        await StateStore.del(stepsKey);
        await CatalogMenu.sendCategoryList(phoneNumber);
        return true;
    }

    if(localFile) {
        const files = Array.isArray(localFile) ? localFile : [localFile];
        for(const file of files) {
            await Messages.sendLocalMedia(file, phoneNumber);
        }
    }

    await StateStore.set(stepsKey, key.step, 86400);

    await Messages.sendMessage({
        text: response.join(''),
        type: type || 'text',
        phoneNumber,
        messageId,
        document,
        location,
        buttonPayload,
        listPayload
    });
    return true;
}

module.exports = {
    sendMessageSteps,
    matchesKeyword,
    findStepResponse
};
