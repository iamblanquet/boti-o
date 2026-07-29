const cleanParticipantName = (value) => {
    const name = String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\s'.-]/gu, '')
        .trim();

    if(name.length < 2 || name.length > 60) return null;
    return name;
};

const parseParticipantNames = (message) => {
    const parts = String(message || '')
        .split(/[,;\n]+/)
        .map(cleanParticipantName)
        .filter(Boolean);

    return parts.length === 2 ? parts : null;
};

const hasTwoParticipantNames = (names) => Array.isArray(names) &&
    names.length === 2 && names.every((name) => cleanParticipantName(name));

const formatParticipantNames = (names) => hasTwoParticipantNames(names)
    ? names.map(cleanParticipantName).join(' y ')
    : null;

module.exports = {
    parseParticipantNames,
    hasTwoParticipantNames,
    formatParticipantNames
};
