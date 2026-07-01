const normalizeLeadCode = (value) => String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

const generateLeadCode = (campaignId) => {
    const id = String(campaignId || '').trim();
    const words = id.split(/[^a-zA-Z0-9]+/).filter(Boolean);
    const prefix = (words.length > 1
        ? words.map((word) => word[0]).join('')
        : words[0] || 'CP'
    ).slice(0, 4).toUpperCase();

    let hash = 0;
    for (const character of id) {
        hash = ((hash * 31) + character.charCodeAt(0)) % 100;
    }

    return `${prefix || 'CP'}${String(hash).padStart(2, '0')}`;
};

const getCampaignLeadCode = (campaign) => (
    normalizeLeadCode(campaign?.leadCode) || generateLeadCode(campaign?.id)
);

const buildAttributedMessage = (campaign) => {
    const message = String(campaign?.prefilledText || 'Hola').trim();
    return `${message} #${getCampaignLeadCode(campaign)}`;
};

const parseCampaignAttribution = (message) => {
    const text = String(message || '');
    const shortCodeMatch = text.match(/\s+#([a-zA-Z0-9]{2,12})\s*$/);

    if (shortCodeMatch) {
        return {
            leadCode: normalizeLeadCode(shortCodeMatch[1]),
            campaignId: null,
            cleanMessage: text.slice(0, shortCodeMatch.index).trim()
        };
    }

    const legacyMatch = text.match(/\s*\(ref:\s*([a-zA-Z0-9_-]+)\)\s*$/i);
    if (legacyMatch) {
        return {
            leadCode: null,
            campaignId: legacyMatch[1].toLowerCase(),
            cleanMessage: text.slice(0, legacyMatch.index).trim()
        };
    }

    return {
        leadCode: null,
        campaignId: null,
        cleanMessage: text
    };
};

module.exports = {
    normalizeLeadCode,
    generateLeadCode,
    getCampaignLeadCode,
    buildAttributedMessage,
    parseCampaignAttribution
};
