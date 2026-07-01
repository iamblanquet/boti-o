const TIMEZONE = process.env.GOOGLE_TIMEZONE || 'America/Mexico_City';

const BUSINESS_HOURS = {
    1: { start: '09:00', end: '18:00' },
    2: { start: '09:00', end: '18:00' },
    3: { start: '09:00', end: '18:00' },
    4: { start: '09:00', end: '18:00' },
    5: { start: '09:00', end: '18:00' },
    6: { start: '09:00', end: '16:00' }
};

const normalizeText = (text) => String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

module.exports = {
    TIMEZONE,
    BUSINESS_HOURS,
    normalizeText
}
