const fs = require('fs');
const path = require('path');
const getSupabase = require('../../config/supabase');

const CitasStorage = require('../citas/almacenamiento');

const normalizePhoneNumber = (phoneNumber) => String(phoneNumber || '')
    .replace(/@c\.us$/i, '')
    .replace(/\D/g, '');


const BACKUP_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUP_FILE = path.join(BACKUP_DIR, 'clientes.json');

const getEmptyBackup = () => ({});

const readBackup = () => {
    try {
        if (!fs.existsSync(BACKUP_FILE)) return getEmptyBackup();
        const raw = fs.readFileSync(BACKUP_FILE, 'utf8');
        return JSON.parse(raw) || getEmptyBackup();
    } catch (error) {
        console.log('No se pudo leer respaldo local de clientes.', error.message);
        return getEmptyBackup();
    }
}

const writeBackup = (backup) => {
    if (getSupabase()) return;
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
    } catch (error) {
        console.log('No se pudo guardar respaldo local de clientes.', error.message);
    }
}

const formatBirthday = (day, month) => {
    if (!day || !month) return null;
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

const normalizeClient = (client) => {
    if (!client) return null;
    return {
        ...client,
        birthdayDay: client.birthdayDay || null,
        birthdayMonth: client.birthdayMonth || null,
        birthday: formatBirthday(client.birthdayDay, client.birthdayMonth)
    };
}

const saveClientBackup = (client) => {
    if (!client || !client.phoneNumber) return;
    const backup = readBackup();
    backup[client.phoneNumber] = {
        phoneNumber: client.phoneNumber,
        name: client.name || null,
        email: client.email || null,
        notes: client.notes || null,
        responsible: client.responsible || null,
        campaignId: client.campaignId || null,
        birthdayDay: client.birthdayDay || null,
        birthdayMonth: client.birthdayMonth || null,
        createdAt: client.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    writeBackup(backup);
}

const getSupabaseClient = () => getSupabase();

// --- SUPABASE PERSISTENCE ---

const toDbClient = (client) => ({
    phone_number: client.phoneNumber,
    name: client.name || null,
    email: client.email || null,
    notes: client.notes || null,
    responsible: client.responsible || null,
    campaign_id: client.campaignId || null,
    birthday_day: client.birthdayDay || null,
    birthday_month: client.birthdayMonth || null
});

const toDbClientWithoutResponsible = (client) => {
    const payload = toDbClient(client);
    delete payload.responsible;
    return payload;
};

const fromDbClient = (row) => {
    if (!row) return null;
    return {
        phoneNumber: row.phone_number,
        name: row.name,
        email: row.email,
        notes: row.notes,
        responsible: row.responsible || null,
        campaignId: row.campaign_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        birthdayDay: row.birthday_day || null,
        birthdayMonth: row.birthday_month || null,
        birthday: formatBirthday(row.birthday_day, row.birthday_month)
    };
}

const isMissingResponsibleColumnError = (error) => (
    error
    && /responsible.*column|column.*responsible|schema cache/i.test(error.message || '')
);

const upsertSupabaseClient = async (client) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    let { data, error } = await supabase
        .from('clients')
        .upsert(toDbClient(client), { onConflict: 'phone_number' })
        .select('*')
        .single();

    if (isMissingResponsibleColumnError(error)) {
        const fallback = await supabase
            .from('clients')
            .upsert(toDbClientWithoutResponsible(client), { onConflict: 'phone_number' })
            .select('*')
            .single();

        data = fallback.data;
        error = fallback.error;
    }

    if (error) {
        console.log('Supabase saveClient error:', error.message);
        return null;
    }

    return {
        ...fromDbClient(data),
        responsible: data.responsible || client.responsible || null
    };
}

const getSupabaseClientByPhone = async (phoneNumber) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const raw = String(phoneNumber || '').trim();
    const clean = normalizePhoneNumber(raw);
    const variants = Array.from(new Set([
        raw,
        clean,
        clean.startsWith('52') && clean.length === 12 ? '521' + clean.slice(2) : null,
        clean.startsWith('521') && clean.length === 13 ? '52' + clean.slice(3) : null
    ].filter(Boolean)));

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .in('phone_number', variants)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.log('Supabase getClient error:', error.message);
        return null;
    }

    return fromDbClient(data);
}

const listSupabaseClients = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

    if (error) {
        console.log('Supabase listClients error:', error.message);
        return null;
    }

    return (data || []).map(fromDbClient);
}



// --- PUBLIC INTERFACE ---

const hasOwn = (object, field) => Object.prototype.hasOwnProperty.call(object || {}, field);

const clearAgendaCache = () => {
    try {
        const agendaCacheFile = path.join(BACKUP_DIR, 'calendar_agenda_cache.json');
        if (fs.existsSync(agendaCacheFile)) {
            fs.unlinkSync(agendaCacheFile);
        }
    } catch (error) {
        console.log('No se pudo limpiar cache de agenda desde clientes:', error.message);
    }
};

const saveClient = async (clientData) => {
    clearAgendaCache();
    if (!clientData.phoneNumber) return null;
    const existing = await getClient(clientData.phoneNumber) || {};

    const payload = {
        phoneNumber: clientData.phoneNumber,
        name: clientData.name ?? existing.name ?? null,
        email: clientData.email ?? existing.email ?? null,
        notes: clientData.notes ?? existing.notes ?? null,
        responsible: clientData.responsible ?? existing.responsible ?? null,
        campaignId: clientData.campaignId ?? existing.campaignId ?? null,
        birthdayDay: hasOwn(clientData, 'birthdayDay') ? clientData.birthdayDay : (existing.birthdayDay ?? null),
        birthdayMonth: hasOwn(clientData, 'birthdayMonth') ? clientData.birthdayMonth : (existing.birthdayMonth ?? null),
        createdAt: clientData.createdAt || existing.createdAt || new Date().toISOString()
    };

    // 1. Guardar en Supabase
    let result = await upsertSupabaseClient(payload);



    // 3. Guardar en respaldo local
    saveClientBackup(result || payload);

    return result || payload;
}

const getClient = async (phoneNumber) => {
    // 1. Supabase
    let client = await getSupabaseClientByPhone(phoneNumber);
    if (client) return client;



    // 3. Respaldo local
    const backup = readBackup();
    return normalizeClient(backup[phoneNumber] || null);
}

const listClients = async () => {
    // 1. Supabase
    let clients = await listSupabaseClients();
    if (clients) return clients;



    // 3. Respaldo local
    const backup = readBackup();
    return Object.values(backup).map(normalizeClient).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

const getClientConfirmedAppointments = async (phoneNumber) => {
    // Traer todas las citas de este número y filtrar por status = 'confirmada'
    // CitasStorage provee getCustomerAppointments
    const appointments = await CitasStorage.getCustomerAppointments(phoneNumber) || [];
    return appointments.filter(apt => apt.status === 'confirmada');
}

const getClientsByPhones = async (phoneNumbers) => {
    if (!phoneNumbers || phoneNumbers.length === 0) return [];
    
    // Normalize phone numbers using normalizePhoneNumber
    const lookupValues = Array.from(new Set(phoneNumbers.map(normalizePhoneNumber).filter(Boolean)));
    if (lookupValues.length === 0) return [];

    // 1. Supabase
    const supabase = getSupabaseClient();
    if (supabase) {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .in('phone_number', lookupValues);
        if (!error && data) {
            return (data || []).map(fromDbClient);
        }
        console.log('Supabase getClientsByPhones error:', error?.message);
    }

    // 3. Respaldo local
    const backup = readBackup();
    const result = [];
    lookupValues.forEach(phone => {
        if (backup[phone]) {
            result.push(normalizeClient(backup[phone]));
        }
    });
    return result;
}

module.exports = {
    saveClient,
    getClient,
    listClients,
    getClientConfirmedAppointments,
    getClientsByPhones
};

