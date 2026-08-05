const StateStore = require('./stateStore');

const normalize = (value) => String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

const isUsableName = (name) => {
    const value = normalize(name);
    if(!value || value.length < 2 || value.length > 60) return false;
    if(/^\+?\d+$/.test(value)) return false;
    if(/^(usuario|cliente|paciente|whatsapp)$/i.test(value)) return false;
    return true;
}

const cleanName = (name) => {
    const value = normalize(name)
        .replace(/[^\p{L}\s'.-]/gu, '')
        .trim();

    if(!isUsableName(value)) return null;
    return value
        .split(' ')
        .filter(Boolean)
        .slice(0, 3)
        .join(' ');
}

const extractNameFromMessage = (message) => {
    const text = normalize(message);
    const patterns = [
        /\b(?:me llamo|mi nombre es)\s+([\p{L}'.-]+(?:\s+[\p{L}'.-]+){0,2})/iu,
        /\b(?:a nombre de)\s+([\p{L}'.-]+(?:\s+[\p{L}'.-]+){0,2})/iu
    ];

    for(const pattern of patterns) {
        const candidate = text.match(pattern)?.[1];
        if(candidate) return cleanName(candidate);
    }

    return null;
}

const profileKey = (phoneNumber) => `${phoneNumber}:profile`;

const getProfile = async (phoneNumber) => {
    const rawProfile = await StateStore.get(profileKey(phoneNumber));
    if(!rawProfile) return {};

    try {
        return JSON.parse(rawProfile);
    } catch (error) {
        await StateStore.del(profileKey(phoneNumber));
        return {};
    }
}

const saveProfile = async (phoneNumber, profile) => {
    await StateStore.set(profileKey(phoneNumber), JSON.stringify({
        ...profile,
        updatedAt: new Date().toISOString()
    }), 60 * 60 * 24 * 90);
}

const rememberName = async (phoneNumber, name, source = 'whatsapp') => {
    const clean = cleanName(name);
    if(!clean) return null;

    const current = await getProfile(phoneNumber);
    if(current.name && source === 'whatsapp') return current.name;

    await saveProfile(phoneNumber, {
        ...current,
        name: clean,
        nameSource: source
    });

    return clean;
}

const rememberFromMessage = async (phoneNumber, message) => {
    const extractedName = extractNameFromMessage(message);
    if(!extractedName) return null;
    return rememberName(phoneNumber, extractedName, 'message');
}

const getDisplayName = async (phoneNumber) => {
    const profile = await getProfile(phoneNumber);
    return cleanName(profile.name);
}

const getFirstName = async (phoneNumber) => {
    const name = await getDisplayName(phoneNumber);
    return name ? name.split(' ')[0] : null;
}

const cleanMissingNamePlaceholder = (value) => value
    .replace(/\s*\{\{name\}\}\s*,?/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^Hola\s*,/i, 'Hola,')
    .replace(/^Hola\s+bienvenida/i, 'Hola, bienvenida')
    .replace(/^Hola\s+bienvenido/i, 'Hola, bienvenido')
    .trim();

const personalizeText = async (phoneNumber, text) => {
    const value = String(text || '');
    const firstName = await getFirstName(phoneNumber);
    if(!firstName) return cleanMissingNamePlaceholder(value);

    if(value.includes('{{name}}')) return value.replace(/\{\{name\}\}/g, firstName);
    if(/^somos thessa/i.test(value)) return `Hola ${firstName}. ${value}`;
    if(/^hola[!,.]?/i.test(value) && !new RegExp(`\\b${firstName}\\b`, 'i').test(value)) {
        return value.replace(/^hola[!,.]?/i, `Hola ${firstName},`);
    }

    return value;
}

module.exports = {
    rememberName,
    rememberFromMessage,
    extractNameFromMessage,
    getDisplayName,
    getFirstName,
    personalizeText
};
