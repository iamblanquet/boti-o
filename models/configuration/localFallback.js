const fs = require('fs/promises');
const path = require('path');
const { CONFIG_KEYS } = require('./keys');

const FALLBACK_FILES = Object.freeze({
    [CONFIG_KEYS.CONVERSATION_FLOW]: path.join(__dirname, '..', '..', 'helpers', 'thessaResponses.json'),
    [CONFIG_KEYS.SYSTEM_MESSAGES]: path.join(__dirname, '..', '..', 'helpers', 'systemMessages.json')
});

const read = async (key, fallback) => {
    const file = FALLBACK_FILES[key];
    if(!file) return fallback;
    try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
        if(error.code !== 'ENOENT') console.error(`No se pudo leer respaldo local de configuracion (${key}):`, error.message);
        return fallback;
    }
};

module.exports = { read };
