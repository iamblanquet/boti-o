const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { TIMEZONE } = require('./configCitas');

const CALENDAR_DIR = path.join(__dirname, '..', 'mediaFiles', 'calendar');
const SHORTENER_TIMEOUT_MS = Number(process.env.URL_SHORTENER_TIMEOUT_MS || 5000);

const pad = (value) => String(value).padStart(2, '0');

const formatUtcDate = (dateInput) => {
    const date = new Date(dateInput);
    return [
        date.getUTCFullYear(),
        pad(date.getUTCMonth() + 1),
        pad(date.getUTCDate())
    ].join('') + 'T' + [
        pad(date.getUTCHours()),
        pad(date.getUTCMinutes()),
        pad(date.getUTCSeconds())
    ].join('') + 'Z';
}

const escapeIcsText = (value) => String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

const foldIcsLine = (line) => {
    const chunks = [];
    let remaining = line;
    while(remaining.length > 74) {
        chunks.push(remaining.slice(0, 74));
        remaining = ` ${remaining.slice(74)}`;
    }
    chunks.push(remaining);
    return chunks.join('\r\n');
}

const getAppointmentTitle = (appointment) => `Cita Thessa - ${appointment.serviceName || 'Servicio'}`;

const getLocation = () => process.env.THESSA_LOCATION || process.env.BUSINESS_LOCATION || '';

const getDescription = (appointment) => [
    `Servicio: ${appointment.serviceName || 'Pendiente'}`,
    `Nombre: ${appointment.name || 'Cliente'}`,
    `Personas: ${appointment.people || 1}`,
    'Gracias por agendar en Thessa.'
].join('\n');

const getGoogleCalendarUrl = (appointment) => {
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: getAppointmentTitle(appointment),
        dates: `${formatUtcDate(appointment.startAt)}/${formatUtcDate(appointment.endAt)}`,
        details: getDescription(appointment),
        ctz: TIMEZONE
    });

    const location = getLocation();
    if(location) params.set('location', location);

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const getTextResponse = async (url) => {
    const response = await axios.get(url, {
        timeout: SHORTENER_TIMEOUT_MS,
        responseType: 'text',
        transformResponse: [(data) => data]
    });
    return String(response.data || '').trim();
}

const normalizeShortUrl = (value) => {
    const text = String(value || '').trim();
    if(!/^https?:\/\/\S+$/i.test(text)) return null;
    return text;
}

const shortenUrl = async (url) => {
    const encodedUrl = encodeURIComponent(url);
    const services = [
        `https://is.gd/create.php?format=simple&url=${encodedUrl}`,
        `https://v.gd/create.php?format=simple&url=${encodedUrl}`,
        `https://tinyurl.com/api-create.php?url=${encodedUrl}`
    ];

    for(const serviceUrl of services) {
        try {
            const shortUrl = normalizeShortUrl(await getTextResponse(serviceUrl));
            if(shortUrl) return shortUrl;
        } catch (error) {
            console.log('No se pudo acortar URL de calendario:', error.message);
        }
    }

    return url;
}

const getShortGoogleCalendarUrl = async (appointment) => shortenUrl(getGoogleCalendarUrl(appointment));

const ensureCalendarDir = () => {
    if(!fs.existsSync(CALENDAR_DIR)) fs.mkdirSync(CALENDAR_DIR, { recursive: true });
}

const createIcsFile = (appointment) => {
    ensureCalendarDir();

    const uid = `thessa-${appointment.id || Date.now()}@thessa`;
    const filename = `cita-thessa-${appointment.id || Date.now()}.ics`;
    const filePath = path.join(CALENDAR_DIR, filename);
    const location = getLocation();
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Thessa//WhatsApp Bot//ES',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${formatUtcDate(new Date())}`,
        `DTSTART:${formatUtcDate(appointment.startAt)}`,
        `DTEND:${formatUtcDate(appointment.endAt)}`,
        `SUMMARY:${escapeIcsText(getAppointmentTitle(appointment))}`,
        `DESCRIPTION:${escapeIcsText(getDescription(appointment))}`,
        location ? `LOCATION:${escapeIcsText(location)}` : null,
        'END:VEVENT',
        'END:VCALENDAR'
    ].filter(Boolean).map(foldIcsLine);

    fs.writeFileSync(filePath, `${lines.join('\r\n')}\r\n`, 'utf8');

    return {
        filename,
        filePath,
        publicPath: `calendar/${filename}`
    };
}

module.exports = {
    createIcsFile,
    getGoogleCalendarUrl,
    getShortGoogleCalendarUrl,
    shortenUrl
}
