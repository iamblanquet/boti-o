const getSupabase = require('../config/supabase');

const memory = new Map();
let tableAvailable = null;

const getSupabaseClient = () => getSupabase();

const markUnavailableIfMissingTable = (error) => {
    const message = String(error?.message || '').toLowerCase();
    if(message.includes('bot_state') || message.includes('schema cache')) {
        tableAvailable = false;
        return true;
    }
    return false;
}

const isExpired = (entry, now = Date.now()) => entry?.expiresAt && entry.expiresAt <= now;

const getMemory = (key) => {
    const entry = memory.get(key);
    if(!entry) return null;
    if(isExpired(entry)) {
        memory.delete(key);
        return null;
    }
    return entry.value;
}

const setMemory = (key, value, ttlSeconds = null) => {
    memory.set(key, {
        value: String(value),
        expiresAt: ttlSeconds ? Date.now() + Number(ttlSeconds) * 1000 : null
    });
}

const get = async (key) => {
    const supabase = getSupabaseClient();
    if(!supabase || tableAvailable === false) return getMemory(key);

    const { data, error } = await supabase
        .from('bot_state')
        .select('value,expires_at')
        .eq('key', key)
        .maybeSingle();

    if(error) {
        if(!markUnavailableIfMissingTable(error)) console.log('Supabase state get error:', error.message);
        return getMemory(key);
    }
    tableAvailable = true;
    if(!data) return null;

    if(data.expires_at && new Date(data.expires_at) <= new Date()) {
        await del(key);
        return null;
    }

    return data.value;
}

const set = async (key, value, ttlSeconds = null) => {
    const supabase = getSupabaseClient();
    const expiresAt = ttlSeconds ? new Date(Date.now() + Number(ttlSeconds) * 1000).toISOString() : null;
    setMemory(key, value, ttlSeconds);

    if(!supabase || tableAvailable === false) return 'OK';

    const { error } = await supabase
        .from('bot_state')
        .upsert({
            key,
            value: String(value),
            expires_at: expiresAt
        }, { onConflict: 'key' });

    if(error) {
        if(!markUnavailableIfMissingTable(error)) console.log('Supabase state set error:', error.message);
    } else {
        tableAvailable = true;
    }

    return 'OK';
}

const expire = async (key, ttlSeconds) => {
    const value = await get(key);
    if(value === null || value === undefined) return 0;
    await set(key, value, ttlSeconds);
    return 1;
}

const del = async (key) => {
    memory.delete(key);
    const supabase = getSupabaseClient();
    if(!supabase || tableAvailable === false) return 1;

    const { error } = await supabase
        .from('bot_state')
        .delete()
        .eq('key', key);

    if(error && !markUnavailableIfMissingTable(error)) console.log('Supabase state del error:', error.message);
    if(!error) tableAvailable = true;
    return 1;
}

module.exports = {
    get,
    set,
    expire,
    del
};
