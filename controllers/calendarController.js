const CitasStorage = require('../models/citas/almacenamiento');
const ClientesStorage = require('../models/clientes/almacenamiento');
const fs = require('fs');
const path = require('path');
const {
    isCalendarConfigured,
    listCalendarEvents,
    listCalendarEventsCached
} = require('../models/googleCalendar');

const AGENDA_CACHE_DIR = path.join(__dirname, '..', 'data');
const AGENDA_CACHE_FILE = path.join(AGENDA_CACHE_DIR, 'calendar_agenda_cache.json');
const AGENDA_CACHE_TTL_MS = Number(process.env.CALENDAR_AGENDA_CACHE_TTL_MS || 5 * 60 * 1000);

const getDescriptionValue = (description, label) => {
    const match = String(description || '').match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
    return match ? match[1].trim() : null;
};

const normalizePhoneNumber = (phoneNumber) => String(phoneNumber || '').replace(/\D/g, '');
const normalizeText = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const isConfirmedStatus = (status) => ['confirmada', 'confirmado', 'confirmed'].includes(normalizeText(status));
const isDisplayableStatus = (status) => ['confirmada', 'confirmado', 'confirmed', 'pendiente'].includes(normalizeText(status));
const parseDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};
const maxDate = (left, right) => left > right ? left : right;
const getStartOfToday = (date = new Date()) => new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
);
const isUpcomingOrInProgress = (event, now = new Date()) => {
    const end = parseDate(event.endAt || event.startAt);
    return Boolean(end && end > now);
};
const eventOverlapsRange = (event, rangeStart, rangeEnd) => {
    const start = parseDate(event.startAt);
    const end = parseDate(event.endAt || event.startAt);
    if(!start || !end) return false;

    return start < rangeEnd && end > rangeStart;
};

const readAgendaCache = () => {
    try {
        if(!fs.existsSync(AGENDA_CACHE_FILE)) return { entries: {} };
        const parsed = JSON.parse(fs.readFileSync(AGENDA_CACHE_FILE, 'utf8'));
        return {
            entries: parsed && typeof parsed.entries === 'object' && parsed.entries
                ? parsed.entries
                : {}
        };
    } catch (error) {
        return { entries: {} };
    }
};

const writeAgendaCache = (cache) => {
    try {
        fs.mkdirSync(AGENDA_CACHE_DIR, { recursive: true });
        fs.writeFileSync(AGENDA_CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (error) {
        console.log('No se pudo guardar cache local de agenda.', error.message);
    }
};

const getAgendaCacheKey = ({ start, end, connected }) => [
    connected ? 'google' : 'local',
    start,
    end
].join('|');
const isAgendaCacheDisabled = () => process.env.CALENDAR_AGENDA_CACHE_DISABLED === 'true';

const toRangedCachePayload = (entry, rangeStart, rangeEnd) => ({
    ...entry,
    payload: {
        ...entry.payload,
        events: (entry.payload.events || []).filter((event) => eventOverlapsRange(event, rangeStart, rangeEnd))
    }
});

const getFreshAgendaCacheEntry = (cacheKey, range = {}) => {
    if(isAgendaCacheDisabled()) return null;

    const now = Date.now();
    const cache = readAgendaCache();
    const exactEntry = cache.entries[cacheKey];
    if(exactEntry?.payload) {
        const ageMs = now - Number(exactEntry.savedAt || 0);
        if(ageMs <= AGENDA_CACHE_TTL_MS) return { ...exactEntry, ageMs, match: 'exact' };
    }

    const rangeStart = parseDate(range.start);
    const rangeEnd = parseDate(range.end);
    if(!rangeStart || !rangeEnd) return null;

    const connectedKey = range.connected ? 'google' : 'local';
    const coveringEntry = Object.values(cache.entries || {})
        .filter((entry) => entry?.payload?.events)
        .map((entry) => ({
            ...entry,
            ageMs: now - Number(entry.savedAt || 0)
        }))
        .filter((entry) => entry.ageMs <= AGENDA_CACHE_TTL_MS)
        .filter((entry) => entry.connectedKey === connectedKey)
        .filter((entry) => {
            const cachedStart = parseDate(entry.start);
            const cachedEnd = parseDate(entry.end);
            return cachedStart && cachedEnd && cachedStart <= rangeStart && cachedEnd >= rangeEnd;
        })
        .sort((left, right) => left.ageMs - right.ageMs)[0];

    return coveringEntry
        ? { ...toRangedCachePayload(coveringEntry, rangeStart, rangeEnd), match: 'covering' }
        : null;
};

const setAgendaCacheEntry = (cacheKey, payload, range = {}) => {
    if(isAgendaCacheDisabled()) return;

    const cache = readAgendaCache();
    cache.entries[cacheKey] = {
        savedAt: Date.now(),
        start: range.start || null,
        end: range.end || null,
        connectedKey: range.connected ? 'google' : 'local',
        payload
    };
    writeAgendaCache(cache);
};

const getPrivateProperties = (event) => event?.extendedProperties?.private || {};

const getGoogleEventValue = (event, key, descriptionLabel = key) => {
    const privateProperties = getPrivateProperties(event);
    return privateProperties[key] || getDescriptionValue(event.description, descriptionLabel);
};

const getMergedStatus = (appointment, event) => {
    const statusCandidates = [
        appointment?.status,
        getGoogleEventValue(event, 'status', 'Estado'),
        event.status
    ].filter(Boolean);

    if(statusCandidates.some(isConfirmedStatus)) return 'confirmada';
    return statusCandidates[0] || null;
};

const listAppointmentsForCalendarRange = (start, end) => {
    if(typeof CitasStorage.listAppointmentsForRange === 'function') {
        return CitasStorage.listAppointmentsForRange(start, end);
    }

    return CitasStorage.listActiveAppointments();
};

const listGoogleEventsForAgenda = async (params) => {
    if(typeof listCalendarEventsCached === 'function') {
        const result = await listCalendarEventsCached({
            ...params,
            backgroundOnMiss: true
        });
        return {
            events: result?.events || [],
            cache: result?.cache || null
        };
    }

    return {
        events: await listCalendarEvents(params),
        cache: null
    };
};

const toLocalCalendarEvent = (appointment) => ({
    id: appointment.id,
    eventId: appointment.eventId || null,
    title: `Cita Thessa - ${appointment.serviceName || 'Servicio'}`,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    clientName: appointment.name || null,
    phoneNumber: appointment.phoneNumber || null,
    serviceName: appointment.serviceName || 'Otros',
    people: appointment.people || 1,
    status: appointment.status,
    htmlLink: appointment.eventId
        ? `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(appointment.eventId)}`
        : null,
    source: appointment.source || 'local'
});

const getConfirmedAppointments = async (req, res) => {
    try {
        const now = new Date();
        const requestedStart = parseDate(req.query.start) || now;
        const requestedEnd = parseDate(req.query.end)
            || new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
        const queryStart = maxDate(requestedStart, getStartOfToday(now));
        const start = queryStart.toISOString();
        const end = requestedEnd.toISOString();
        const hasCalendar = isCalendarConfigured();
        const agendaCacheKey = getAgendaCacheKey({ start, end, connected: hasCalendar });
        const agendaCacheRange = { start, end, connected: hasCalendar };
        const cachedAgenda = getFreshAgendaCacheEntry(agendaCacheKey, agendaCacheRange);

        if(cachedAgenda) {
            return res.json({
                ...cachedAgenda.payload,
                cache: {
                    ...(cachedAgenda.payload.cache || {}),
                    agenda: { hit: true, ageMs: cachedAgenda.ageMs, match: cachedAgenda.match }
                }
            });
        }

        if(requestedEnd <= now || requestedEnd <= queryStart) {
            return res.json({
                events: [],
                source: hasCalendar ? 'google' : 'local',
                connected: hasCalendar,
                warning: null
            });
        }

        const [appointmentsResult, googleResult] = await Promise.allSettled([
            listAppointmentsForCalendarRange(start, end),
            hasCalendar ? listGoogleEventsForAgenda({ timeMin: start, timeMax: end }) : Promise.resolve({ events: [] })
        ]);

        if(appointmentsResult.status === 'rejected') throw appointmentsResult.reason;

        const rangeAppointments = appointmentsResult.value || [];
        const googlePayload = googleResult.status === 'fulfilled' ? googleResult.value || {} : {};
        const googleEvents = googlePayload.events || [];
        const googleCache = googlePayload.cache || null;
        const googleWarning = hasCalendar && googleResult.status === 'rejected'
            ? googleResult.reason?.message || 'No se pudo consultar Google Calendar.'
            : null;

        const confirmed = rangeAppointments
            .filter((appointment) => isDisplayableStatus(appointment.status))
            .filter((appointment) => isUpcomingOrInProgress(appointment, now))
            .map(toLocalCalendarEvent);
        const upcomingGoogleEvents = googleEvents.filter((event) => isUpcomingOrInProgress(event, now));

        const phoneSet = new Set();
        confirmed.forEach((appointment) => {
            if (appointment.phoneNumber) {
                phoneSet.add(normalizePhoneNumber(appointment.phoneNumber));
            }
        });
        upcomingGoogleEvents.forEach((event) => {
            const phone = getGoogleEventValue(event, 'phoneNumber', 'Telefono WhatsApp');
            if (phone) {
                phoneSet.add(normalizePhoneNumber(phone));
            }
        });

        const clients = phoneSet.size
            ? await ClientesStorage.getClientsByPhones(Array.from(phoneSet))
            : [];
        const clientsByPhone = new Map(
            (clients || []).map((client) => [normalizePhoneNumber(client.phoneNumber), client])
        );

        // Map names from the clients DB back to local confirmed events if needed
        confirmed.forEach((appointment) => {
            if (appointment.phoneNumber) {
                const client = clientsByPhone.get(normalizePhoneNumber(appointment.phoneNumber));
                if (client?.name) {
                    appointment.clientName = client.name;
                }
            }
        });

        if (!hasCalendar) {
            const payload = {
                events: confirmed,
                source: 'local',
                connected: false,
                warning: 'Google Calendar no esta configurado. Se muestran las citas confirmadas guardadas por el bot.'
            };
            setAgendaCacheEntry(agendaCacheKey, payload, agendaCacheRange);
            return res.json(payload);
        }

        if (googleWarning) {
            console.error('Google Calendar list fallback:', googleWarning);
            const payload = {
                events: confirmed,
                source: 'local',
                connected: false,
                warning: googleWarning
            };
            setAgendaCacheEntry(agendaCacheKey, payload, agendaCacheRange);
            return res.json(payload);
        }

        try {
            const appointmentsByEventId = new Map(
                confirmed
                    .filter((appointment) => appointment.eventId)
                    .map((appointment) => [appointment.eventId, appointment])
            );

            const mergedEvents = upcomingGoogleEvents.map((event) => {
                const appointment = appointmentsByEventId.get(event.eventId);
                const phoneNumber = appointment?.phoneNumber
                    || getGoogleEventValue(event, 'phoneNumber', 'Telefono WhatsApp');
                const client = clientsByPhone.get(normalizePhoneNumber(phoneNumber));

                const status = getMergedStatus(appointment, event);

                return {
                    ...event,
                    clientName: client?.name
                        || appointment?.clientName
                        || getGoogleEventValue(event, 'clientName', 'Cliente'),
                    phoneNumber,
                    serviceName: appointment?.serviceName
                        || getGoogleEventValue(event, 'serviceName', 'Servicio')
                        || (event.title ? event.title.replace(/^Cita Thessa\s*-\s*/i, '') : 'Otros'),
                    people: appointment?.people
                        || getGoogleEventValue(event, 'people', 'Personas')
                        || 1,
                    status
                };
            })
                .filter((event) => isDisplayableStatus(event.status))
                .filter((event) => isUpcomingOrInProgress(event, now));

            const googleEventIds = new Set(mergedEvents.map((event) => event.eventId));
            confirmed.forEach((appointment) => {
                if (!appointment.eventId || !googleEventIds.has(appointment.eventId)) {
                    mergedEvents.push(appointment);
                }
            });

            mergedEvents.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

            const payload = {
                events: mergedEvents,
                source: 'google',
                connected: true,
                cache: googleCache,
                warning: null
            };
            if(!googleCache?.refreshing) {
                setAgendaCacheEntry(agendaCacheKey, payload, agendaCacheRange);
            }
            return res.json(payload);
        } catch (calendarError) {
            console.error('Google Calendar list fallback:', calendarError.message);
            const payload = {
                events: confirmed,
                source: 'local',
                connected: false,
                warning: calendarError.message
            };
            setAgendaCacheEntry(agendaCacheKey, payload, agendaCacheRange);
            return res.json(payload);
        }
    } catch (error) {
        console.error('Error al obtener citas confirmadas para el calendario:', error);
        res.status(500).json({ error: 'No se pudieron obtener las citas confirmadas' });
    }
};

const createSilentResponse = () => ({
    status() {
        return this;
    },
    json(payload) {
        return payload;
    }
});

const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const getStartOfWeek = (date) => {
    const start = getStartOfToday(date);
    const day = start.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    return addDays(start, offset);
};

const getWarmCalendarRanges = (now = new Date()) => {
    const today = getStartOfToday(now);
    const weekStart = getStartOfWeek(now);
    const weekEnd = addDays(weekStart, 7);
    const monthEnd = addDays(today, 45);

    return [
        { start: today, end: addDays(today, 1) },
        { start: today, end: weekEnd > today ? weekEnd : addDays(today, 7) },
        { start: today, end: monthEnd }
    ].filter((range, index, ranges) => ranges.findIndex((item) => (
        item.start.getTime() === range.start.getTime() &&
        item.end.getTime() === range.end.getTime()
    )) === index);
};

const warmCalendarAgendaCache = async () => {
    if(process.env.CALENDAR_AGENDA_CACHE_DISABLED === 'true') return;

    const ranges = getWarmCalendarRanges();
    for(const range of ranges) {
        const query = {
            start: range.start.toISOString(),
            end: range.end.toISOString()
        };

        await getConfirmedAppointments({ query }, createSilentResponse());
        await new Promise((resolve) => setTimeout(resolve, 1800));
        await getConfirmedAppointments({ query }, createSilentResponse());
    }
};

module.exports = {
    getConfirmedAppointments,
    warmCalendarAgendaCache
};
