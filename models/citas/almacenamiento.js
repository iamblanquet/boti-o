const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const getSupabase = require('../../config/supabase');
const StateStore = require('../stateStore');
const CampaignFunnel = require('../campaigns/funnelService');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUP_FILE = path.join(BACKUP_DIR, 'citas.json');
const LEGACY_BACKUP_FILE = path.join(BACKUP_DIR, 'appointments.json');

const flowKey = (phoneNumber) => `${phoneNumber}:appointment:flow`;

const normalizePhoneNumber = (phoneNumber) => String(phoneNumber || '')
    .replace(/@c\.us$/i, '')
    .replace(/\D/g, '');

const ACTIVE_STATUSES = new Set(['pendiente', 'confirmada']);
const isUpcomingActiveAppointment = (appointment, now = new Date()) => {
    if(!appointment || !ACTIVE_STATUSES.has(appointment.status)) return false;
    const endAt = new Date(appointment.endAt || appointment.startAt);
    return !Number.isNaN(endAt.getTime()) && endAt >= now;
};

const getEmptyBackup = () => ({
    appointments: {},
    customers: {},
    active: []
});

const readBackup = () => {
    try {
        const backupFile = fs.existsSync(BACKUP_FILE) ? BACKUP_FILE : LEGACY_BACKUP_FILE;
        if(!fs.existsSync(backupFile)) return getEmptyBackup();
        const raw = fs.readFileSync(backupFile, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            ...getEmptyBackup(),
            ...parsed,
            appointments: parsed.appointments || {},
            customers: parsed.customers || {},
            active: Array.isArray(parsed.active) ? parsed.active : []
        };
    } catch (error) {
        console.log('No se pudo leer respaldo local de citas.', error.message);
        return getEmptyBackup();
    }
}

const writeBackup = (backup) => {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
    } catch (error) {
        console.log('No se pudo guardar respaldo local de citas.', error.message);
    }
}

const saveAppointmentBackup = (appointment) => {
    if(!appointment?.id || !appointment?.phoneNumber) return;

    const backup = readBackup();
    backup.appointments[appointment.id] = appointment;

    const customerIds = new Set(backup.customers[appointment.phoneNumber] || []);
    customerIds.add(appointment.id);
    backup.customers[appointment.phoneNumber] = Array.from(customerIds);

    const activeIds = new Set(backup.active || []);
    if(!['cancelada', 'expirada'].includes(appointment.status)) {
        activeIds.add(appointment.id);
    } else {
        activeIds.delete(appointment.id);
    }
    backup.active = Array.from(activeIds);

    writeBackup(backup);
}

const getSupabaseClient = () => getSupabase();

const toDbAppointment = (appointment) => {
    const metadata = {
        date: appointment.date,
        time: appointment.time,
        price: appointment.price,
        source: appointment.source,
        participantNames: appointment.participantNames,
        expiredAt: appointment.expiredAt,
        calendarSyncStatus: appointment.calendarSyncStatus
    };

    Object.keys(metadata).forEach((key) => {
        if(metadata[key] === undefined) delete metadata[key];
    });

    return {
        id: appointment.id,
        phone_number: appointment.phoneNumber,
        name: appointment.name || null,
        service_id: appointment.serviceId || null,
        service_name: appointment.serviceName,
        duration_minutes: appointment.durationMinutes || null,
        people: appointment.people || null,
        start_at: appointment.startAt,
        end_at: appointment.endAt,
        status: appointment.status || 'pendiente',
        event_id: appointment.eventId || null,
        confirmed_at: appointment.confirmedAt || null,
        reminders: appointment.reminders || {},
        metadata
    };
}

const fromDbAppointment = (row) => {
    if(!row) return null;

    return {
        ...(row.metadata || {}),
        id: row.id,
        phoneNumber: row.phone_number,
        name: row.name,
        serviceId: row.service_id,
        serviceName: row.service_name,
        durationMinutes: row.duration_minutes,
        people: row.people,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status,
        eventId: row.event_id,
        confirmedAt: row.confirmed_at,
        reminders: row.reminders || {},
        expiredAt: row.metadata?.expiredAt,
        calendarSyncStatus: row.metadata?.calendarSyncStatus,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

const upsertSupabaseAppointment = async (appointment) => {
    const supabase = getSupabaseClient();
    if(!supabase) return null;

    const { data, error } = await supabase
        .from('appointments')
        .upsert(toDbAppointment(appointment), { onConflict: 'id' })
        .select('*')
        .single();

    if(error) {
        console.log('Supabase saveAppointment error:', error.message);
        return null;
    }

    return fromDbAppointment(data);
}

const getSupabaseAppointment = async (id) => {
    const supabase = getSupabaseClient();
    if(!supabase) return null;

    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if(error) {
        console.log('Supabase getAppointment error:', error.message);
        return null;
    }

    return fromDbAppointment(data);
}

const listSupabaseActiveAppointments = async () => {
    const supabase = getSupabaseClient();
    if(!supabase) return null;

    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .in('status', ['pendiente', 'confirmada'])
        .gte('end_at', new Date().toISOString())
        .order('start_at', { ascending: true });

    if(error) {
        console.log('Supabase listActiveAppointments error:', error.message);
        return null;
    }

    return (data || []).map(fromDbAppointment);
}

const listSupabaseAppointmentsReadyForPostCare = async (now = new Date()) => {
    const supabase = getSupabaseClient();
    if(!supabase) return null;

    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('status', 'confirmada')
        .gte('end_at', since)
        .lte('end_at', now.toISOString())
        .order('end_at', { ascending: true });

    if(error) {
        console.log('Supabase listAppointmentsReadyForPostCare error:', error.message);
        return null;
    }

    return (data || []).map(fromDbAppointment);
};

const listSupabaseCustomerAppointments = async (phoneNumber) => {
    const supabase = getSupabaseClient();
    if(!supabase) return null;

    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('phone_number', phoneNumber)
        .order('start_at', { ascending: false });

    if(error) {
        console.log('Supabase getCustomerAppointments error:', error.message);
        return null;
    }

    return (data || []).map(fromDbAppointment);
}

const groupAppointmentsByPhone = (appointments = []) => {
    const grouped = new Map();
    appointments.forEach((appointment) => {
        const phone = normalizePhoneNumber(appointment.phoneNumber);
        if(!phone) return;
        if(!grouped.has(phone)) grouped.set(phone, []);
        grouped.get(phone).push(appointment);
    });

    grouped.forEach((items) => {
        items.sort((a, b) => new Date(b.startAt || 0) - new Date(a.startAt || 0));
    });

    return grouped;
}

const listSupabaseCustomerAppointmentsByPhones = async (phoneNumbers) => {
    const supabase = getSupabaseClient();
    if(!supabase) return null;

    const lookupValues = Array.from(new Set((phoneNumbers || [])
        .flatMap((phoneNumber) => [String(phoneNumber || '').trim(), normalizePhoneNumber(phoneNumber)])
        .filter(Boolean)));
    if(!lookupValues.length) return new Map();

    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .in('phone_number', lookupValues)
        .order('start_at', { ascending: false });

    if(error) {
        console.log('Supabase getCustomerAppointmentsByPhoneNumbers error:', error.message);
        return null;
    }

    return groupAppointmentsByPhone((data || []).map(fromDbAppointment));
}

const parseJson = async (key) => {
    const raw = await StateStore.get(key);
    if(!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        await StateStore.del(key);
        return null;
    }
}

const getFlow = async (phoneNumber) => parseJson(flowKey(phoneNumber));

const saveFlow = async (phoneNumber, flow) => {
    await StateStore.set(flowKey(phoneNumber), JSON.stringify(flow), 86400);
}

const clearFlow = async (phoneNumber) => {
    await StateStore.del(flowKey(phoneNumber));
}

const clearAgendaCache = () => {
    try {
        const agendaCacheFile = path.join(BACKUP_DIR, 'calendar_agenda_cache.json');
        if (fs.existsSync(agendaCacheFile)) {
            fs.unlinkSync(agendaCacheFile);
        }
    } catch (error) {
        console.log('No se pudo limpiar cache de agenda desde almacenamiento:', error.message);
    }
};

const saveAppointment = async (appointment) => {
    clearAgendaCache();
    const id = appointment.id || uuidv4();
    const now = new Date().toISOString();
    const payload = {
        ...appointment,
        id,
        createdAt: appointment.createdAt || now,
        updatedAt: now
    };

    const supabaseAppointment = await upsertSupabaseAppointment(payload);
    if(supabaseAppointment) {
        saveAppointmentBackup(supabaseAppointment);
        await CampaignFunnel.recordAppointment(supabaseAppointment);
        return supabaseAppointment;
    }

    console.log('Supabase no disponible para guardar cita. Usando respaldo local.');
    saveAppointmentBackup(payload);
    await CampaignFunnel.recordAppointment(payload);

    return payload;
}

const getAppointment = async (id) => {
    const supabaseAppointment = await getSupabaseAppointment(id);
    if(supabaseAppointment) return supabaseAppointment;

    const backup = readBackup();
    return backup.appointments[id] || null;
}

const listActiveAppointments = async () => {
    const supabaseAppointments = await listSupabaseActiveAppointments();
    if(supabaseAppointments) return supabaseAppointments;

    const backup = readBackup();
    const ids = backup.active || [];
    const appointments = [];

    for(const id of ids) {
        const appointment = await getAppointment(id);
        if(appointment) appointments.push(appointment);
    }

    return appointments.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

const getCustomerAppointments = async (phoneNumber) => {
    const supabaseAppointments = await listSupabaseCustomerAppointments(phoneNumber);
    if(supabaseAppointments) return supabaseAppointments;

    const backup = readBackup();
    const ids = backup.customers[phoneNumber] || [];
    const appointments = [];

    for(const id of ids) {
        const appointment = await getAppointment(id);
        if(appointment) appointments.push(appointment);
    }

    return appointments.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
}

const getCustomerAppointmentsByPhoneNumbers = async (phoneNumbers) => {
    const normalizedPhones = new Set((phoneNumbers || []).map(normalizePhoneNumber).filter(Boolean));
    if(!normalizedPhones.size) return new Map();

    const supabaseAppointments = await listSupabaseCustomerAppointmentsByPhones(phoneNumbers);
    if(supabaseAppointments) return supabaseAppointments;

    const backup = readBackup();
    const appointments = Object.values(backup.appointments || {})
        .filter((appointment) => normalizedPhones.has(normalizePhoneNumber(appointment.phoneNumber)));

    return groupAppointmentsByPhone(appointments);
}

const getLatestActiveAppointment = async (phoneNumber) => {
    const appointments = await getCustomerAppointments(phoneNumber);
    return appointments.find((appointment) => isUpcomingActiveAppointment(appointment)) || null;
}

const listSupabaseAppointmentsNeedingCalendarSync = async () => {
    const supabase = getSupabaseClient();
    if(!supabase) return null;

    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .in('status', ['cancelada', 'expirada'])
        .contains('metadata', { calendarSyncStatus: 'pending-delete' });
    if(error) {
        console.log('Supabase listAppointmentsNeedingCalendarSync error:', error.message);
        return null;
    }
    return (data || []).map(fromDbAppointment);
};

const getUpcomingActiveAppointments = async (phoneNumber, now = new Date()) => {
    const appointments = await getCustomerAppointments(phoneNumber);
    return appointments
        .filter((appointment) => isUpcomingActiveAppointment(appointment, now))
        .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
};

const listAppointmentsNeedingCalendarSync = async () => {
    const supabaseAppointments = await listSupabaseAppointmentsNeedingCalendarSync();
    if(supabaseAppointments) return supabaseAppointments;
    const backup = readBackup();
    return Object.values(backup.appointments || {}).filter((appointment) =>
        ['cancelada', 'expirada'].includes(appointment.status) && appointment.calendarSyncStatus === 'pending-delete'
    );
};

const listAppointmentsReadyForPostCare = async (now = new Date()) => {
    const supabaseAppointments = await listSupabaseAppointmentsReadyForPostCare(now);
    if(supabaseAppointments) return supabaseAppointments;

    const since = now.getTime() - 24 * 60 * 60 * 1000;
    return Object.values(readBackup().appointments || {}).filter((appointment) => {
        const endAt = new Date(appointment.endAt).getTime();
        return appointment.status === 'confirmada' && Number.isFinite(endAt) && endAt >= since && endAt <= now.getTime();
    });
};

module.exports = {
    getFlow,
    saveFlow,
    clearFlow,
    saveAppointment,
    getAppointment,
    listActiveAppointments,
    getCustomerAppointments,
    getCustomerAppointmentsByPhoneNumbers,
    getLatestActiveAppointment,
    getUpcomingActiveAppointments,
    isUpcomingActiveAppointment,
    listAppointmentsNeedingCalendarSync,
    listAppointmentsReadyForPostCare
}
