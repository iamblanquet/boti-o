const fs = require('fs');
const path = require('path');
const getSupabase = require('../../config/supabase');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data');
const LEADS_FILE = path.join(BACKUP_DIR, 'campaign_leads.json');
const EVENTS_FILE = path.join(BACKUP_DIR, 'campaign_funnel_events.json');
const CLIENTS_FILE = path.join(BACKUP_DIR, 'clientes.json');

const normalizePhone = (value) => String(value || '')
    .replace(/@c\.us$/i, '')
    .replace(/\D/g, '');

const readJson = (file, fallback = {}) => {
    try {
        if(!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, 'utf8')) || fallback;
    } catch(error) {
        console.log(`No se pudo leer ${path.basename(file)}.`, error.message);
        return fallback;
    }
}

const writeJson = (file, value) => {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(value, null, 2));
    } catch(error) {
        console.log(`No se pudo guardar ${path.basename(file)}.`, error.message);
    }
}

const normalizeLeadEntry = (entry) => {
    if(typeof entry === 'string') {
        return { phoneNumber: normalizePhone(entry), createdAt: null };
    }

    return {
        phoneNumber: normalizePhone(entry?.phoneNumber || entry?.phone_number),
        createdAt: entry?.createdAt || entry?.created_at || null
    };
}

const getLocalCampaignLeads = (campaignIds) => {
    const ids = new Set((campaignIds || []).filter(Boolean));
    const leads = readJson(LEADS_FILE);
    const result = [];

    Object.entries(leads).forEach(([campaignId, entries]) => {
        if(ids.size > 0 && !ids.has(campaignId)) return;
        (entries || []).forEach((entry) => {
            const normalized = normalizeLeadEntry(entry);
            if(normalized.phoneNumber) {
                result.push({ campaignId, ...normalized });
            }
        });
    });

    return result;
};

const getLocalEvents = (campaignIds) => {
    const ids = new Set((campaignIds || []).filter(Boolean));
    return Object.values(readJson(EVENTS_FILE))
        .filter((event) => !ids.size || ids.has(event.campaignId))
        .map((event) => ({
            campaignId: event.campaignId,
            phoneNumber: normalizePhone(event.phoneNumber),
            stage: event.stage,
            appointmentId: event.appointmentId || null,
            occurredAt: event.occurredAt || null
        }));
};

const getLocalClientsByPhone = (phoneNumbers) => {
    const phones = new Set((phoneNumbers || []).map(normalizePhone).filter(Boolean));
    const clients = readJson(CLIENTS_FILE);
    const result = new Map();

    Object.values(clients).forEach((client) => {
        const phoneNumber = normalizePhone(client?.phoneNumber || client?.phone_number);
        if(phoneNumber && phones.has(phoneNumber)) {
            result.set(phoneNumber, client?.name || null);
        }
    });

    return result;
};

const isBeforeOrEqual = (date, eventAt) => (
    !date || !eventAt || new Date(date).getTime() <= new Date(eventAt).getTime()
);

const findLocalLead = (phoneNumber, eventAt) => {
    const cleanPhone = normalizePhone(phoneNumber);
    const leads = readJson(LEADS_FILE);
    const matches = [];

    Object.entries(leads).forEach(([campaignId, entries]) => {
        (entries || []).forEach((entry) => {
            const normalized = normalizeLeadEntry(entry);
            if(normalized.phoneNumber === cleanPhone && isBeforeOrEqual(normalized.createdAt, eventAt)) {
                matches.push({ campaignId, ...normalized });
            }
        });
    });

    return matches.sort((a, b) => (
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    ))[0] || null;
}

const findSupabaseLead = async (phoneNumber, eventAt) => {
    const supabase = getSupabase();
    if(!supabase) return null;

    let query = supabase
        .from('campaign_leads')
        .select('campaign_id,phone_number,created_at')
        .eq('phone_number', normalizePhone(phoneNumber))
        .order('created_at', { ascending: false })
        .limit(1);

    if(eventAt) query = query.lte('created_at', eventAt);

    const { data, error } = await query.maybeSingle();
    if(error) {
        console.log('Supabase find campaign lead error:', error.message);
        return null;
    }

    return data ? {
        campaignId: data.campaign_id,
        phoneNumber: data.phone_number,
        createdAt: data.created_at
    } : null;
}

const findLeadForPhone = async (phoneNumber, eventAt = new Date().toISOString()) => (
    await findSupabaseLead(phoneNumber, eventAt) || findLocalLead(phoneNumber, eventAt)
);

const saveLocalEvent = (event) => {
    const events = readJson(EVENTS_FILE);
    const key = `${event.campaignId}:${event.phoneNumber}:${event.stage}`;
    if(events[key]) return false;
    events[key] = event;
    writeJson(EVENTS_FILE, events);
    return true;
}

const registerEvent = async ({ campaignId, phoneNumber, stage, occurredAt, appointmentId = null }) => {
    const cleanPhone = normalizePhone(phoneNumber);
    if(!campaignId || !cleanPhone || !stage) return false;

    const event = {
        campaignId,
        phoneNumber: cleanPhone,
        stage,
        appointmentId,
        occurredAt: occurredAt || new Date().toISOString()
    };

    const supabase = getSupabase();
    if(supabase) {
        const { error } = await supabase
            .from('campaign_funnel_events')
            .insert({
                campaign_id: event.campaignId,
                phone_number: event.phoneNumber,
                stage: event.stage,
                appointment_id: event.appointmentId,
                occurred_at: event.occurredAt
            });

        if(!error) {
            saveLocalEvent(event);
            return true;
        }

        if(error.code === '23505') return false;
        console.log('Supabase register funnel event error:', error.message);
    }

    return saveLocalEvent(event);
}

const getEventCounts = async (campaignIds) => {
    const ids = [...new Set((campaignIds || []).filter(Boolean))];
    const counts = new Map(ids.map((id) => [id, {
        contacted: new Set(),
        appointment_created: new Set(),
        captured: new Set()
    }]));

    const addEvent = (campaignId, stage, phoneNumber) => {
        const cleanPhone = normalizePhone(phoneNumber);
        if(!counts.has(campaignId) || !counts.get(campaignId)[stage] || !cleanPhone) return;
        counts.get(campaignId)[stage].add(cleanPhone);
    };

    const supabase = getSupabase();
    let loadedFromSupabase = false;
    if(supabase && ids.length > 0) {
        const { data, error } = await supabase
            .from('campaign_funnel_events')
            .select('campaign_id,phone_number,stage')
            .in('campaign_id', ids);

        if(!error) {
            loadedFromSupabase = true;
            (data || []).forEach((event) => (
                addEvent(event.campaign_id, event.stage, event.phone_number)
            ));
        } else {
            console.log('Supabase campaign funnel metrics error:', error.message);
        }
    }

    if(!loadedFromSupabase) {
        Object.values(readJson(EVENTS_FILE)).forEach((event) => (
            addEvent(event.campaignId, event.stage, event.phoneNumber)
        ));
    }

    return new Map([...counts.entries()].map(([campaignId, stages]) => [
        campaignId,
        {
            contactedCount: stages.contacted.size,
            appointmentsCount: stages.appointment_created.size,
            capturedCount: stages.captured.size
        }
    ]));
}

const getSupabaseLeadDetails = async (campaignIds) => {
    const ids = [...new Set((campaignIds || []).filter(Boolean))];
    const supabase = getSupabase();
    if(!supabase || ids.length === 0) return null;

    const { data: leadsData, error: leadsError } = await supabase
        .from('campaign_leads')
        .select('campaign_id,phone_number,created_at')
        .in('campaign_id', ids);

    if(leadsError) {
        console.log('Supabase campaign lead details error:', leadsError.message);
        return null;
    }

    let eventsData = [];
    const { data: eventRows, error: eventsError } = await supabase
        .from('campaign_funnel_events')
        .select('campaign_id,phone_number,stage,appointment_id,occurred_at')
        .in('campaign_id', ids);

    if(!eventsError) {
        eventsData = eventRows || [];
    } else {
        console.log('Supabase campaign funnel details error:', eventsError.message);
    }

    const phoneNumbers = [...new Set((leadsData || []).map((lead) => normalizePhone(lead.phone_number)).filter(Boolean))];
    let clientNames = new Map();
    if(phoneNumbers.length > 0) {
        const { data: clientsData, error: clientsError } = await supabase
            .from('clients')
            .select('phone_number,name')
            .in('phone_number', phoneNumbers);

        if(!clientsError) {
            clientNames = new Map((clientsData || []).map((client) => [
                normalizePhone(client.phone_number),
                client.name || null
            ]));
        }
    }

    return buildLeadDetails(ids, leadsData.map((lead) => ({
        campaignId: lead.campaign_id,
        phoneNumber: lead.phone_number,
        createdAt: lead.created_at
    })), eventsData.map((event) => ({
        campaignId: event.campaign_id,
        phoneNumber: event.phone_number,
        stage: event.stage,
        appointmentId: event.appointment_id,
        occurredAt: event.occurred_at
    })), clientNames);
};

const buildLeadDetails = (campaignIds, leads, events, clientNames = new Map()) => {
    const result = new Map((campaignIds || []).map((campaignId) => [campaignId, []]));
    const eventMap = new Map();

    (events || []).forEach((event) => {
        const cleanPhone = normalizePhone(event.phoneNumber);
        if(!event.campaignId || !cleanPhone || !event.stage) return;

        const key = `${event.campaignId}:${cleanPhone}`;
        if(!eventMap.has(key)) eventMap.set(key, {});
        eventMap.get(key)[event.stage] = {
            occurredAt: event.occurredAt || null,
            appointmentId: event.appointmentId || null
        };
    });

    (leads || []).forEach((lead) => {
        const cleanPhone = normalizePhone(lead.phoneNumber);
        if(!lead.campaignId || !cleanPhone) return;

        const campaignEvents = eventMap.get(`${lead.campaignId}:${cleanPhone}`) || {};
        if(!result.has(lead.campaignId)) result.set(lead.campaignId, []);

        result.get(lead.campaignId).push({
            phoneNumber: cleanPhone,
            name: clientNames.get(cleanPhone) || null,
            leadCreatedAt: lead.createdAt || null,
            contacted: Boolean(campaignEvents.contacted),
            contactedAt: campaignEvents.contacted?.occurredAt || null,
            appointmentCreated: Boolean(campaignEvents.appointment_created),
            appointmentCreatedAt: campaignEvents.appointment_created?.occurredAt || null,
            appointmentId: campaignEvents.appointment_created?.appointmentId || campaignEvents.captured?.appointmentId || null,
            captured: Boolean(campaignEvents.captured),
            capturedAt: campaignEvents.captured?.occurredAt || null
        });
    });

    result.forEach((items, campaignId) => {
        result.set(campaignId, items.sort((a, b) => (
            new Date(b.leadCreatedAt || 0).getTime() - new Date(a.leadCreatedAt || 0).getTime()
        )));
    });

    return result;
};

const getLeadDetailsByCampaign = async (campaignIds) => {
    const ids = [...new Set((campaignIds || []).filter(Boolean))];
    if(ids.length === 0) return new Map();

    const supabaseDetails = await getSupabaseLeadDetails(ids);
    if(supabaseDetails) return supabaseDetails;

    const localLeads = getLocalCampaignLeads(ids);
    const localEvents = getLocalEvents(ids);
    const clientNames = getLocalClientsByPhone(localLeads.map((lead) => lead.phoneNumber));
    return buildLeadDetails(ids, localLeads, localEvents, clientNames);
};

module.exports = {
    normalizePhone,
    findLeadForPhone,
    registerEvent,
    getEventCounts,
    getLeadDetailsByCampaign
};
