require('dotenv').config();

const Configuration = require('../models/configuration/repository');
const LocalFallback = require('../models/configuration/localFallback');
const { CONFIG_KEYS } = require('../models/configuration/keys');
const { validateConversationFlow, validateSystemMessages } = require('../models/configuration/validators');
const { DEFAULT_MESSAGES } = require('../utils/systemMessageLoader');

const entries = [
    {
        key: CONFIG_KEYS.CONVERSATION_FLOW,
        fallback: [],
        validate: validateConversationFlow,
        save: Configuration.saveConversationFlow
    },
    {
        key: CONFIG_KEYS.SYSTEM_MESSAGES,
        fallback: {},
        validate: (value) => validateSystemMessages(value, DEFAULT_MESSAGES),
        save: Configuration.saveSystemMessageOverrides
    }
];

const migrate = async () => {
    for(const entry of entries) {
        const existing = await Configuration.getStored(entry.key);
        if(existing) {
            console.log(`${entry.key}: ya existe en Supabase; sin cambios.`);
            continue;
        }
        const value = await LocalFallback.read(entry.key, entry.fallback);
        entry.validate(value);
        await entry.save(value, 'migration:local-files');
        console.log(`${entry.key}: migrada correctamente.`);
    }
};

migrate().catch((error) => {
    console.error('No se pudo migrar la configuracion:', error.message);
    process.exitCode = 1;
});
