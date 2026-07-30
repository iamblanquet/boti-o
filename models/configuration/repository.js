const getSupabase = require('../../config/supabase');
const LocalFallback = require('./localFallback');
const { CONFIG_KEYS } = require('./keys');

const CACHE_TTL_MS = Number(process.env.BOT_CONFIGURATION_CACHE_TTL_MS || 30000);
const cache = new Map();
let testClient = null;

const getClient = () => testClient || getSupabase();
const isFresh = (entry) => entry && Date.now() - entry.savedAt < CACHE_TTL_MS;

const get = async (key, fallback) => {
    const cached = cache.get(key);
    if(isFresh(cached)) return cached.value;

    const supabase = getClient();
    if(supabase) {
        const { data, error } = await supabase
            .from('bot_configuration')
            .select('value, version, updated_at')
            .eq('key', key)
            .maybeSingle();
        if(!error && data?.value !== undefined) {
            cache.set(key, { value: data.value, savedAt: Date.now(), version: data.version });
            return data.value;
        }
        if(error) {
            console.error(`No se pudo leer configuracion ${key} desde Supabase:`, error.message);
            if(cached) return cached.value;
        }
    }

    const value = await LocalFallback.read(key, fallback);
    cache.set(key, { value, savedAt: Date.now(), version: 0 });
    return value;
};

const save = async (key, value, updatedBy = null) => {
    const supabase = getClient();
    if(!supabase) {
        const error = new Error('La configuracion no se puede guardar porque Supabase no esta disponible.');
        error.code = 'BOT_CONFIGURATION_UNAVAILABLE';
        throw error;
    }

    const { data, error } = await supabase
        .from('bot_configuration')
        .upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .select('value, version, updated_at')
        .single();
    if(error) throw error;

    cache.set(key, { value: data.value, savedAt: Date.now(), version: data.version });
    return data.value;
};

const getStored = async (key) => {
    const supabase = getClient();
    if(!supabase) return null;
    const { data, error } = await supabase
        .from('bot_configuration')
        .select('value, version, updated_at')
        .eq('key', key)
        .maybeSingle();
    if(error) throw error;
    return data || null;
};

const invalidate = (key = null) => {
    if(key) cache.delete(key);
    else cache.clear();
};

const getConversationFlow = () => get(CONFIG_KEYS.CONVERSATION_FLOW, []);
const saveConversationFlow = (flow, updatedBy) => save(CONFIG_KEYS.CONVERSATION_FLOW, flow, updatedBy);
const getSystemMessageOverrides = () => get(CONFIG_KEYS.SYSTEM_MESSAGES, {});
const saveSystemMessageOverrides = (messages, updatedBy) => save(CONFIG_KEYS.SYSTEM_MESSAGES, messages, updatedBy);

const __setTestClient = (client) => { testClient = client; invalidate(); };

module.exports = {
    getConversationFlow,
    saveConversationFlow,
    getSystemMessageOverrides,
    saveSystemMessageOverrides,
    getStored,
    invalidate,
    __setTestClient
};
