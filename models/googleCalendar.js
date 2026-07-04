const { google } = require('googleapis');
const { TIMEZONE } = require('../utils/configCitas');
const fs = require('fs');
const path = require('path');

const getCalendarId = () => process.env.GOOGLE_CALENDAR_ID || 'primary';
const CALENDAR_EVENT_FIELDS = [
    'nextPageToken',
    'items(id,status,summary,description,start,end,htmlLink,location,extendedProperties)'
].join(',');
const CACHE_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'calendar_events_cache.json');
const CACHE_TTL_MS = Number(process.env.GOOGLE_CALENDAR_CACHE_TTL_MS || 5 * 60 * 1000);
const CACHE_STALE_MS = Number(process.env.GOOGLE_CALENDAR_CACHE_STALE_MS || 24 * 60 * 60 * 1000);

// In-memory cache for credentials, auth client and calendar client instances
let serviceAccountCredsInstance = null;
let authClientInstance = null;
let calendarInstance = null;

const getServiceAccountCreds = () => {
    if (serviceAccountCredsInstance) {
        return serviceAccountCredsInstance;
    }
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try {
            serviceAccountCredsInstance = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
            return serviceAccountCredsInstance;
        } catch (e) {
            console.error('Error al parsear GOOGLE_SERVICE_ACCOUNT_JSON:', e.message);
        }
    }
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
        try {
            const fileContent = fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8');
            serviceAccountCredsInstance = JSON.parse(fileContent);
            return serviceAccountCredsInstance;
        } catch (e) {
            console.error('Error al leer GOOGLE_SERVICE_ACCOUNT_KEY_PATH:', e.message);
        }
    }
    return null;
};

const isCalendarConfigured = () => {
    return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
}

const getAuthClient = () => {
    if (authClientInstance) {
        return authClientInstance;
    }
    if(!isCalendarConfigured()) {
        const error = new Error('Faltan credenciales de Google Calendar.');
        error.missingConfig = true;
        throw error;
    }

    const serviceCreds = getServiceAccountCreds();
    if (serviceCreds) {
        authClientInstance = new google.auth.JWT({
            email: serviceCreds.client_email,
            key: serviceCreds.private_key,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });
        return authClientInstance;
    }

    const error = new Error('Faltan credenciales de Google Service Account.');
    error.missingConfig = true;
    throw error;
}

const getCalendar = () => {
    if (calendarInstance) {
        return calendarInstance;
    }
    calendarInstance = google.calendar({ version: 'v3', auth: getAuthClient() });
    return calendarInstance;
};

const normalizeCalendarError = (error) => {
    if(error && (error.message === 'invalid_grant' || error.response?.data?.error === 'invalid_grant')) {
        const calendarError = new Error('Google Calendar no pudo autorizarse. Verifica las credenciales de la Cuenta de Servicio.');
        calendarError.invalidGrant = true;
        throw calendarError;
    }

    throw error;
}

const isMissingCalendarEventError = (error) => {
    const status = error?.code || error?.response?.status;
    return status === 404 || status === 410;
}

const isAvailable = async (start, end) => {
    const calendar = getCalendar();
    let response;
    try {
        response = await calendar.freebusy.query({
            requestBody: {
                timeMin: start.toISOString(),
                timeMax: end.toISOString(),
                timeZone: TIMEZONE,
                items: [{ id: getCalendarId() }]
            }
        });
    } catch (error) {
        normalizeCalendarError(error);
    }

    const busy = response.data.calendars[getCalendarId()]?.busy || [];
    return busy.length === 0;
}

// In-memory cache for listed events
let lastEventsCache = null;
let lastEventsCacheTime = 0;
let lastEventsCacheParams = '';
const inFlightCacheRefreshes = new Map();

const clearEventsCache = () => {
    const now = Date.now();
    const globalCacheKey = [getCalendarId(), 'global'].join('|');
    
    lastEventsCacheTime = now - CACHE_TTL_MS - 1000;
    lastEventsCacheParams = globalCacheKey;

    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (cache && cache.entries && cache.entries[globalCacheKey]) {
                cache.entries[globalCacheKey].savedAt = now - CACHE_TTL_MS - 1000;
                fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
            } else {
                fs.unlinkSync(CACHE_FILE);
            }
        }
    } catch (error) {
        console.log('No se pudo invalidar cache local de Google Calendar.', error.message);
    }

    try {
        const agendaCacheFile = path.join(CACHE_DIR, 'calendar_agenda_cache.json');
        if (fs.existsSync(agendaCacheFile)) {
            fs.unlinkSync(agendaCacheFile);
        }
    } catch (error) {
        console.log('No se pudo limpiar cache local de agenda.', error.message);
    }
};

const readPersistentEventsCache = () => {
    try {
        if(!fs.existsSync(CACHE_FILE)) return { entries: {} };
        const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return {
            entries: parsed && typeof parsed.entries === 'object' && parsed.entries
                ? parsed.entries
                : {}
        };
    } catch (error) {
        console.log('No se pudo leer cache local de Google Calendar.', error.message);
        return { entries: {} };
    }
};

const writePersistentEventsCache = (cache) => {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (error) {
        console.log('No se pudo guardar cache local de Google Calendar.', error.message);
    }
};

const getEventsCacheKey = ({ timeMin, timeMax } = {}) => [
    getCalendarId(),
    timeMin ? new Date(timeMin).toISOString() : '',
    timeMax ? new Date(timeMax).toISOString() : ''
].join('|');

const getNormalizedGlobalRange = (now = new Date()) => {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const minDate = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    const maxDate = new Date(startOfToday.getTime() + 180 * 24 * 60 * 60 * 1000);
    return {
        timeMin: minDate.toISOString(),
        timeMax: maxDate.toISOString()
    };
};

const filterEventsByRange = (events, timeMin, timeMax) => {
    const minTime = timeMin ? new Date(timeMin).getTime() : 0;
    const maxTime = timeMax ? new Date(timeMax).getTime() : Infinity;
    return (events || []).filter(event => {
        const start = new Date(event.startAt).getTime();
        const end = new Date(event.endAt || event.startAt).getTime();
        return start < maxTime && end > minTime;
    });
};

const getPersistentEventsCacheEntry = (params) => {
    const cache = readPersistentEventsCache();
    const cacheKey = getEventsCacheKey(params);
    return { cache, cacheKey, entry: cache.entries[cacheKey] || null };
};

const setPersistentEventsCacheEntry = (params, events) => {
    const { cache, cacheKey } = getPersistentEventsCacheEntry(params);
    cache.entries[cacheKey] = {
        calendarId: getCalendarId(),
        timeMin: params?.timeMin || null,
        timeMax: params?.timeMax || null,
        savedAt: Date.now(),
        events: events || []
    };
    writePersistentEventsCache(cache);
};

const refreshPersistentEventsCache = (params, cacheKey) => {
    if(inFlightCacheRefreshes.has(cacheKey)) return inFlightCacheRefreshes.get(cacheKey);

    const refresh = listCalendarEvents(params)
        .catch((error) => {
            console.log('No se pudo refrescar cache de Google Calendar:', error.message);
            return null;
        })
        .finally(() => {
            inFlightCacheRefreshes.delete(cacheKey);
        });

    inFlightCacheRefreshes.set(cacheKey, refresh);
    return refresh;
};

const toExtendedPropertyValue = (value) => {
    if(value === undefined || value === null || value === '') return null;
    return String(value).slice(0, 1024);
}

const buildAppointmentExtendedProperties = (appointment = {}) => {
    const privateProperties = {
        app: 'thessa',
        appointmentId: appointment.id,
        status: appointment.status || 'pendiente',
        phoneNumber: appointment.phoneNumber,
        serviceId: appointment.serviceId,
        serviceName: appointment.serviceName,
        clientName: appointment.name,
        people: appointment.people
    };

    const normalized = Object.entries(privateProperties).reduce((acc, [key, value]) => {
        const normalizedValue = toExtendedPropertyValue(value);
        if(normalizedValue !== null) acc[key] = normalizedValue;
        return acc;
    }, {});

    return { private: normalized };
}

const createAppointmentEvent = async ({ appointment, start, end }) => {
    clearEventsCache();
    const calendar = getCalendar();
    let response;
    try {
        response = await calendar.events.insert({
            calendarId: getCalendarId(),
            requestBody: {
                summary: `Cita Thessa - ${appointment.serviceName}`,
                description: [
                    `Cliente: ${appointment.name}`,
                    `Telefono WhatsApp: ${appointment.phoneNumber}`,
                    `Servicio: ${appointment.serviceName}`,
                    `Personas: ${appointment.people}`,
                    'Estado: pendiente de confirmacion'
                ].join('\n'),
                extendedProperties: buildAppointmentExtendedProperties(appointment),
                start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
                end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 120 },
                        { method: 'popup', minutes: 1440 }
                    ]
                }
            }
        });
    } catch (error) {
        normalizeCalendarError(error);
    }

    return response.data;
}

const updateAppointmentEvent = async ({ eventId, appointment, start, end }) => {
    clearEventsCache();
    const calendar = getCalendar();
    let response;
    try {
        response = await calendar.events.patch({
            calendarId: getCalendarId(),
            eventId,
            requestBody: {
                summary: `Cita Thessa - ${appointment.serviceName}`,
                description: [
                    `Cliente: ${appointment.name}`,
                    `Telefono WhatsApp: ${appointment.phoneNumber}`,
                    `Servicio: ${appointment.serviceName}`,
                    `Personas: ${appointment.people}`,
                    `Estado: ${appointment.status}`
                ].join('\n'),
                extendedProperties: buildAppointmentExtendedProperties(appointment),
                start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
                end: { dateTime: end.toISOString(), timeZone: TIMEZONE }
            }
        });
    } catch (error) {
        normalizeCalendarError(error);
    }

    return response.data;
}

const cancelAppointmentEvent = async (eventId) => {
    clearEventsCache();
    const calendar = getCalendar();
    try {
        await calendar.events.delete({ calendarId: getCalendarId(), eventId });
    } catch (error) {
        if(isMissingCalendarEventError(error)) return;
        normalizeCalendarError(error);
    }
}

const listCalendarEvents = async ({ timeMin, timeMax } = {}) => {
    const globalCacheKey = [getCalendarId(), 'global'].join('|');
    const now = Date.now();

    // Re-use cache if it is less than 60 seconds old
    if (lastEventsCache && (now - lastEventsCacheTime < 60000) && lastEventsCacheParams === globalCacheKey) {
        return lastEventsCache;
    }

    const calendar = getCalendar();
    const items = [];
    let pageToken = null;

    try {
        do {
            const response = await calendar.events.list({
                calendarId: getCalendarId(),
                timeMin: (timeMin ? new Date(timeMin) : new Date()).toISOString(),
                timeMax: timeMax ? new Date(timeMax).toISOString() : undefined,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 2500,
                pageToken,
                timeZone: TIMEZONE,
                fields: CALENDAR_EVENT_FIELDS
            });

            items.push(...(response.data.items || []));
            pageToken = response.data.nextPageToken || null;
        } while(pageToken);
    } catch (error) {
        normalizeCalendarError(error);
    }

    const events = items
        .filter((event) => event.status !== 'cancelled' && event.start?.dateTime)
        .map((event) => ({
            id: event.id,
            eventId: event.id,
            title: event.summary || 'Evento de Google Calendar',
            description: event.description || '',
            startAt: event.start.dateTime,
            endAt: event.end?.dateTime || event.start.dateTime,
            htmlLink: event.htmlLink || null,
            location: event.location || null,
            extendedProperties: event.extendedProperties || {},
            source: 'google-calendar',
            status: event.status
        }));

    lastEventsCache = events;
    lastEventsCacheTime = now;
    lastEventsCacheParams = globalCacheKey;

    const cache = readPersistentEventsCache();
    cache.entries[globalCacheKey] = {
        calendarId: getCalendarId(),
        timeMin,
        timeMax,
        savedAt: now,
        events: events || []
    };
    writePersistentEventsCache(cache);

    return events;
}

const listCalendarEventsCached = async ({ timeMin, timeMax, backgroundOnMiss = false } = {}) => {
    const now = Date.now();
    const globalParams = getNormalizedGlobalRange(new Date(now));
    const globalCacheKey = [getCalendarId(), 'global'].join('|');

    // 1. Check in-memory global cache
    if (lastEventsCache && (now - lastEventsCacheTime < CACHE_TTL_MS) && lastEventsCacheParams === globalCacheKey) {
        const filtered = filterEventsByRange(lastEventsCache, timeMin, timeMax);
        return {
            events: filtered,
            cache: { hit: true, stale: false, source: 'memory', ageMs: now - lastEventsCacheTime }
        };
    }

    // 2. Check persistent file global cache
    const cache = readPersistentEventsCache();
    const entry = cache.entries[globalCacheKey] || null;
    if (entry && Array.isArray(entry.events)) {
        const ageMs = now - Number(entry.savedAt || 0);
        lastEventsCache = entry.events;
        lastEventsCacheTime = Number(entry.savedAt || now);
        lastEventsCacheParams = globalCacheKey;

        if (ageMs <= CACHE_TTL_MS) {
            const filtered = filterEventsByRange(entry.events, timeMin, timeMax);
            return {
                events: filtered,
                cache: { hit: true, stale: false, source: 'file', ageMs }
            };
        }

        if (ageMs <= CACHE_STALE_MS) {
            refreshPersistentEventsCache(globalParams, globalCacheKey);
            const filtered = filterEventsByRange(entry.events, timeMin, timeMax);
            return {
                events: filtered,
                cache: { hit: true, stale: true, source: 'file', ageMs, refreshing: true }
            };
        }
    }

    // 3. Cache miss
    if (backgroundOnMiss) {
        refreshPersistentEventsCache(globalParams, globalCacheKey);
        return {
            events: [],
            cache: {
                hit: false,
                stale: false,
                source: inFlightCacheRefreshes.has(globalCacheKey) ? 'google-refreshing' : 'miss',
                refreshing: true
            }
        };
    }

    // Synchronous fetch for global range
    const allEvents = await listCalendarEvents(globalParams);
    const filtered = filterEventsByRange(allEvents, timeMin, timeMax);
    return {
        events: filtered,
        cache: { hit: false, stale: false, source: 'google' }
    };
}

module.exports = {
    isCalendarConfigured,
    isAvailable,
    createAppointmentEvent,
    updateAppointmentEvent,
    cancelAppointmentEvent,
    listCalendarEvents,
    listCalendarEventsCached
}
