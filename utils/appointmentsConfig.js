const TIMEZONE = process.env.GOOGLE_TIMEZONE || 'America/Mexico_City';

const BUSINESS_HOURS = {
    1: { start: '10:00', end: '19:00' },
    2: { start: '10:00', end: '19:00' },
    3: { start: '10:00', end: '19:00' },
    4: { start: '10:00', end: '19:00' },
    5: { start: '10:00', end: '19:00' },
    6: { start: '10:00', end: '16:00' }
};

const SERVICES = [
    { id: 'lumi-piel', name: 'Lumi Piel', durationMinutes: 90, keywords: ['lumi piel', 'hidratacion', 'hidratante'] },
    { id: 'chocolaterapia-for-her', name: 'Chocolaterapia For Her', durationMinutes: 90, keywords: ['chocolaterapia', 'chocolaterapia for her'] },
    { id: 'royal-skin', name: 'Royal Skin', durationMinutes: 150, keywords: ['royal skin', 'membresia', 'membresia top', 'hifu', 'pdrn'] },
    { id: 'seda-effect', name: 'Seda Effect', durationMinutes: 90, keywords: ['seda effect', 'dermaplaning', 'dermafacial'] },
    { id: 'soft-harmony', name: 'Soft Harmony', durationMinutes: 120, keywords: ['soft harmony', 'masaje', 'relajante', 'limpieza facial'] }
];

const normalizeText = (text) => String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const findService = (text) => {
    const value = normalizeText(text);
    return SERVICES.find((service) => {
        return service.keywords.some((keyword) => value.includes(normalizeText(keyword))) ||
            value.includes(normalizeText(service.name));
    });
}

const getServiceById = (id) => SERVICES.find((service) => service.id === id);
const listServices = () => SERVICES.map((service) => service.name).join(', ');

module.exports = {
    TIMEZONE,
    BUSINESS_HOURS,
    SERVICES,
    findService,
    getServiceById,
    listServices,
    normalizeText
}
