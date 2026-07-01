const { BUSINESS_HOURS, TIMEZONE, normalizeText } = require('./configCitas');

const pad = (value) => String(value).padStart(2, '0');

const formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const WEEKDAYS = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6
};

const getNextWeekday = (targetDay, now) => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentDay = today.getDay();
    let diff = targetDay - currentDay;
    if(diff <= 0) diff += 7;

    const date = new Date(today);
    date.setDate(date.getDate() + diff);
    return date;
}

const parseDateText = (text, now = new Date()) => {
    const value = normalizeText(text);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if(value.includes('hoy')) return formatDate(today);
    if(value.includes('manana') || /\bma.?ana\b/.test(value)) {
        const date = new Date(today);
        date.setDate(date.getDate() + 1);
        return formatDate(date);
    }

    for(const [weekday, day] of Object.entries(WEEKDAYS)) {
        if(value.includes(weekday)) {
            return formatDate(getNextWeekday(day, now));
        }
    }

    const isoMatch = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if(isoMatch) return `${isoMatch[1]}-${pad(isoMatch[2])}-${pad(isoMatch[3])}`;

    const slashMatch = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/);
    if(slashMatch) {
        let year = Number(slashMatch[3] || now.getFullYear());
        const month = Number(slashMatch[2]);
        const day = Number(slashMatch[1]);
        const parsedDate = new Date(year, month - 1, day);
        if(!slashMatch[3] && parsedDate < today) year += 1;
        return `${year}-${pad(month)}-${pad(day)}`;
    }

    return null;
}

const parseTimeText = (text) => {
    const value = normalizeText(text).replace(/\s+/g, ' ');
    const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if(!match) return null;

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const period = match[3];

    if(period === 'pm' && hour < 12) hour += 12;
    if(period === 'am' && hour === 12) hour = 0;
    if(!period && hour >= 1 && hour <= 7) hour += 12;
    if(hour > 23 || minute > 59) return null;

    return `${pad(hour)}:${pad(minute)}`;
}

const parsePeopleText = (text, loose = false) => {
    const value = normalizeText(text);
    const mentionsPeople = ['persona', 'personas', 'pax', 'gente'].some((keyword) => value.includes(keyword));
    if(!loose && !mentionsPeople) return null;

    const explicitMatch = value.match(/\b(\d+)\s*(persona|personas|pax)\b/);
    if(explicitMatch) {
        const people = Number(explicitMatch[1]);
        return people > 0 && people <= 10 ? people : null;
    }

    const paraMatch = value.match(/\bpara\s+(\d+)\b(?!\s*(am|pm))/);
    if(paraMatch) {
        const people = Number(paraMatch[1]);
        return people > 0 && people <= 10 ? people : null;
    }

    const match = loose ? value.match(/^\s*(\d+)\s*$/) : null;
    if(match) {
        const people = Number(match[1]);
        return people > 0 && people <= 10 ? people : null;
    }
    if(value.includes('dos')) return 2;
    if(value.includes('una') || value.includes('uno')) return 1;
    return null;
}

const combineDateTime = (date, time) => new Date(`${date}T${time}:00`);
const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

const isWithinBusinessHours = (start, durationMinutes) => {
    const hours = BUSINESS_HOURS[start.getDay()];
    if(!hours) return false;

    const date = formatDate(start);
    const businessStart = combineDateTime(date, hours.start);
    const businessEnd = combineDateTime(date, hours.end);
    const end = addMinutes(start, durationMinutes);

    return start >= businessStart && end <= businessEnd;
}

const formatHumanDateTime = (dateInput) => {
    const date = new Date(dateInput);
    return new Intl.DateTimeFormat('es-MX', {
        timeZone: TIMEZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

module.exports = {
    parseDateText,
    parseTimeText,
    parsePeopleText,
    combineDateTime,
    addMinutes,
    isWithinBusinessHours,
    formatHumanDateTime,
    formatDate,
    formatTime
}
