const getSupabase = require('../../config/supabase');
const fs = require('fs');
const path = require('path');
const {
    normalizeLeadCode,
    getCampaignLeadCode
} = require('../../utils/campaignAttribution');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data');
const CAMPAIGNS_FILE = path.join(BACKUP_DIR, 'campaigns.json');
const CAMPAIGN_LEADS_FILE = path.join(BACKUP_DIR, 'campaign_leads.json');

const readBackupCampaigns = () => {
    try {
        if (!fs.existsSync(CAMPAIGNS_FILE)) return {};
        const raw = fs.readFileSync(CAMPAIGNS_FILE, 'utf8');
        return JSON.parse(raw) || {};
    } catch (error) {
        console.log('No se pudo leer respaldo local de campañas.', error.message);
        return {};
    }
}

const writeBackupCampaigns = (backup) => {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(backup, null, 2));
    } catch (error) {
        console.log('No se pudo guardar respaldo local de campañas.', error.message);
    }
}

const readBackupLeads = () => {
    try {
        if (!fs.existsSync(CAMPAIGN_LEADS_FILE)) return {};
        const raw = fs.readFileSync(CAMPAIGN_LEADS_FILE, 'utf8');
        return JSON.parse(raw) || {};
    } catch (error) {
        console.log('No se pudo leer respaldo local de leads.', error.message);
        return {};
    }
}

const writeBackupLeads = (backup) => {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(CAMPAIGN_LEADS_FILE, JSON.stringify(backup, null, 2));
    } catch (error) {
        console.log('No se pudo guardar respaldo local de leads.', error.message);
    }
}

const getSupabaseClient = () => getSupabase();

const mapCampaign = (campaign) => ({
    id: campaign.id,
    leadCode: campaign.lead_code || campaign.leadCode || null,
    name: campaign.name,
    source: campaign.source,
    medium: campaign.medium,
    prefilledText: campaign.prefilled_text ?? campaign.prefilledText ?? null,
    clicks: campaign.clicks,
    leadsCount: campaign.leads_count ?? campaign.leadsCount,
    createdAt: campaign.created_at ?? campaign.createdAt,
    updatedAt: campaign.updated_at ?? campaign.updatedAt
});

const countLocalLeads = (campaignId, leadsBackup = readBackupLeads()) => (
    new Set((leadsBackup[campaignId] || [])
        .map((entry) => String(
            typeof entry === 'string' ? entry : entry?.phoneNumber || entry?.phone_number || ''
        ).replace(/\D/g, ''))
        .filter(Boolean)
    ).size
);

const getSupabaseLeadCounts = async (supabase, campaignIds) => {
    const ids = [...new Set((campaignIds || []).filter(Boolean))];
    if (!supabase || ids.length === 0) return null;

    const { data, error } = await supabase
        .from('campaign_leads')
        .select('campaign_id, phone_number')
        .in('campaign_id', ids);

    if (error) {
        console.log('Supabase campaign lead count error:', error.message);
        return null;
    }

    const phonesByCampaign = new Map(ids.map((id) => [id, new Set()]));
    (data || []).forEach(({ campaign_id: campaignId, phone_number: phoneNumber }) => {
        const cleanPhone = String(phoneNumber || '').replace(/\D/g, '');
        if (campaignId && cleanPhone) {
            if (!phonesByCampaign.has(campaignId)) phonesByCampaign.set(campaignId, new Set());
            phonesByCampaign.get(campaignId).add(cleanPhone);
        }
    });

    return new Map(
        [...phonesByCampaign.entries()].map(([campaignId, phones]) => [campaignId, phones.size])
    );
};

// --- PUBLIC METHODS ---

const saveCampaign = async (campaignData) => {
    const { id, leadCode, name, source, medium, prefilledText } = campaignData;
    const payload = {
        id,
        lead_code: normalizeLeadCode(leadCode),
        name,
        source,
        medium: medium || null,
        prefilled_text: prefilledText || null,
        updated_at: new Date().toISOString()
    };

    // 1. Supabase
    const supabase = getSupabaseClient();
    let result = null;
    if (supabase) {
        const { data, error } = await supabase
            .from('campaigns')
            .upsert(payload, { onConflict: 'id' })
            .select('*')
            .single();

        if (error) {
            console.log('Supabase saveCampaign error:', error.message);
        } else {
            result = mapCampaign(data);
        }
    }

    // 2. Fallback to Local Backup
    const backup = readBackupCampaigns();
    const existing = backup[id] || { clicks: 0, leadsCount: 0, createdAt: new Date().toISOString() };
    
    const localCampaign = {
        id,
        leadCode: normalizeLeadCode(leadCode),
        name,
        source,
        medium: medium || null,
        prefilledText: prefilledText || null,
        clicks: result ? result.clicks : existing.clicks,
        leadsCount: result ? result.leadsCount : existing.leadsCount,
        createdAt: result ? result.createdAt : existing.createdAt,
        updatedAt: new Date().toISOString()
    };

    backup[id] = localCampaign;
    writeBackupCampaigns(backup);

    return result || localCampaign;
}

const getCampaign = async (id) => {
    // 1. Supabase
    const supabase = getSupabaseClient();
    if (supabase) {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (!error && data) {
            const campaign = mapCampaign(data);
            const leadCounts = await getSupabaseLeadCounts(supabase, [campaign.id]);
            if (leadCounts) campaign.leadsCount = leadCounts.get(campaign.id) || 0;
            return campaign;
        }
    }

    // 2. Backup
    const backup = readBackupCampaigns();
    if (!backup[id]) return null;

    return {
        ...backup[id],
        leadsCount: countLocalLeads(id)
    };
}

const listCampaigns = async () => {
    let campaignsMap = new Map();

    // 1. Load Backup first
    const backup = readBackupCampaigns();
    const leadsBackup = readBackupLeads();
    Object.values(backup).forEach(campaign => {
        campaignsMap.set(campaign.id, {
            ...campaign,
            leadsCount: countLocalLeads(campaign.id, leadsBackup)
        });
    });

    // 2. Load Supabase and override local if exists
    const supabase = getSupabaseClient();
    if (supabase) {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            const leadCounts = await getSupabaseLeadCounts(supabase, data.map((item) => item.id));
            data.forEach(item => {
                const mapped = mapCampaign(item);
                if (leadCounts) mapped.leadsCount = leadCounts.get(mapped.id) || 0;
                campaignsMap.set(mapped.id, mapped);
            });
        }
    }

    return Array.from(campaignsMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

const getCampaignByLeadCode = async (leadCode) => {
    const normalizedCode = normalizeLeadCode(leadCode);
    if (!normalizedCode) return null;

    const campaigns = await listCampaigns();
    return campaigns.find((campaign) => (
        getCampaignLeadCode(campaign) === normalizedCode
    )) || null;
};

const deleteCampaign = async (id) => {
    // 1. Supabase
    const supabase = getSupabaseClient();
    if (supabase) {
        const { error } = await supabase
            .from('campaigns')
            .delete()
            .eq('id', id);

        if (error) {
            console.log('Supabase deleteCampaign error:', error.message);
        }
    }

    // 2. Backup
    const backup = readBackupCampaigns();
    if (backup[id]) {
        delete backup[id];
        writeBackupCampaigns(backup);
    }

    return true;
}

const incrementCampaignClicks = async (id) => {
    // 1. Supabase
    const supabase = getSupabaseClient();
    let updated = null;
    if (supabase) {
        const { data: atomicData, error: atomicError } = await supabase
            .rpc('increment_campaign_clicks', { campaign_key: id });

        if (!atomicError && atomicData) {
            updated = Array.isArray(atomicData) ? atomicData[0] : atomicData;
        } else {
            const { data: current } = await supabase
                .from('campaigns')
                .select('clicks')
                .eq('id', id)
                .maybeSingle();

            const currentClicks = current ? current.clicks : 0;
            const { data, error } = await supabase
                .from('campaigns')
                .update({ clicks: currentClicks + 1 })
                .eq('id', id)
                .select('*')
                .maybeSingle();

            if (!error && data) updated = data;
        }
    }

    // 2. Backup
    const backup = readBackupCampaigns();
    if (backup[id]) {
        backup[id].clicks = updated ? updated.clicks : (backup[id].clicks || 0) + 1;
        backup[id].updatedAt = new Date().toISOString();
        writeBackupCampaigns(backup);
    }
}

const registerCampaignLead = async (id, phoneNumber) => {
    const cleanPhone = String(phoneNumber || '').replace(/@c\.us$/i, '').replace(/\D/g, '');
    if (!id || !cleanPhone || !await getCampaign(id)) return false;
    
    // Check if lead conversion is already registered for this campaign and user
    // 1. Supabase
    const supabase = getSupabaseClient();
    let isNewLead = false;

    if (supabase) {
        const { data: atomicResult, error: atomicError } = await supabase
            .rpc('register_campaign_lead', {
                campaign_key: id,
                lead_phone: cleanPhone
            });

        if (!atomicError) {
            isNewLead = Boolean(atomicResult);
        } else {
            const { error } = await supabase
                .from('campaign_leads')
                .insert({ campaign_id: id, phone_number: cleanPhone });

            if (!error) {
                isNewLead = true;
                const { data: campaignData } = await supabase
                    .from('campaigns')
                    .select('leads_count')
                    .eq('id', id)
                    .maybeSingle();

                const currentLeads = campaignData ? campaignData.leads_count : 0;
                await supabase
                    .from('campaigns')
                    .update({ leads_count: currentLeads + 1 })
                    .eq('id', id);
            }
        }
    } else {
        // 2. Local Backup check
        const leadsBackup = readBackupLeads();
        if (!leadsBackup[id]) leadsBackup[id] = [];

        const existingLead = leadsBackup[id].some((entry) => (
            String(typeof entry === 'string' ? entry : entry?.phoneNumber || entry?.phone_number || '')
                .replace(/\D/g, '') === cleanPhone
        ));

        if (!existingLead) {
            leadsBackup[id].push({
                phoneNumber: cleanPhone,
                createdAt: new Date().toISOString()
            });
            writeBackupLeads(leadsBackup);
            isNewLead = true;
        }
    }

    // Update campaign metrics in local campaigns backup
    const campaignsBackup = readBackupCampaigns();
    if (campaignsBackup[id]) {
        if (supabase) {
            const dbCamp = await getCampaign(id);
            if (dbCamp) {
                campaignsBackup[id].leadsCount = dbCamp.leadsCount;
            }
        } else if (isNewLead) {
            campaignsBackup[id].leadsCount = (campaignsBackup[id].leadsCount || 0) + 1;
        }
        campaignsBackup[id].updatedAt = new Date().toISOString();
        writeBackupCampaigns(campaignsBackup);
    }

    return isNewLead;
}

module.exports = {
    saveCampaign,
    getCampaign,
    getCampaignByLeadCode,
    listCampaigns,
    deleteCampaign,
    incrementCampaignClicks,
    registerCampaignLead
};
