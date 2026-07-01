const getSupabase = require('../config/supabase');

const memoryControls = new Map();
let dbUnavailable = false;

const DEFAULT_CONTROL = {
    mode: 'bot',
    takenBy: null,
    reason: '',
    takenAt: null,
    releasedAt: null,
    assistedFlow: null,
    updatedAt: null
};

const mapDbControl = (row) => {
    if(!row) return null;
    return {
        phoneNumber: row.phone_number,
        mode: row.mode || 'bot',
        takenBy: row.taken_by || null,
        reason: row.reason || '',
        takenAt: row.taken_at || null,
        releasedAt: row.released_at || null,
        assistedFlow: row.assisted_flow || null,
        updatedAt: row.updated_at || null
    };
}

const isEnabled = () => Boolean(getSupabase()) && !dbUnavailable;

const rememberUnavailableTable = (error) => {
    const message = String(error?.message || '').toLowerCase();
    if(
        error?.code === '42P01' ||
        error?.code === 'PGRST205' ||
        error?.code === 'PGRST204' ||
        message.includes('conversation_controls') ||
        message.includes('assisted_flow')
    ) {
        dbUnavailable = true;
        return true;
    }
    return false;
}

const getMemoryControl = (phoneNumber) => memoryControls.get(phoneNumber) || {
    phoneNumber,
    ...DEFAULT_CONTROL
};

const getControl = async (phoneNumber) => {
    if(!phoneNumber) return null;

    if(isEnabled()) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('conversation_controls')
            .select('*')
            .eq('phone_number', phoneNumber)
            .maybeSingle();

        if(error) {
            const missingTable = rememberUnavailableTable(error);
            if(!missingTable) console.log('Supabase getControl error:', error.message);
        } else if(data) {
            const mapped = mapDbControl(data);
            memoryControls.set(phoneNumber, mapped);
            return mapped;
        }
    }

    return getMemoryControl(phoneNumber);
}

const saveMemoryControl = (phoneNumber, control) => {
    const next = {
        phoneNumber,
        ...DEFAULT_CONTROL,
        ...getMemoryControl(phoneNumber),
        ...control,
        updatedAt: control.updatedAt || new Date().toISOString()
    };
    memoryControls.set(phoneNumber, next);
    return next;
}

const saveControl = async (phoneNumber, control) => {
    if(!phoneNumber) return null;
    const previous = await getControl(phoneNumber);
    const now = new Date().toISOString();
    const next = {
        ...(previous || { phoneNumber, ...DEFAULT_CONTROL }),
        ...control,
        updatedAt: now
    };

    if(isEnabled()) {
        const supabase = getSupabase();
        const dbPayload = {
            phone_number: phoneNumber,
            mode: next.mode || 'bot',
            taken_by: next.takenBy || null,
            reason: next.reason || '',
            taken_at: next.takenAt || null,
            released_at: next.releasedAt || null,
            assisted_flow: next.assistedFlow || null,
            updated_at: now
        };

        const { data, error } = await supabase
            .from('conversation_controls')
            .upsert(dbPayload, { onConflict: 'phone_number' })
            .select('*')
            .maybeSingle();

        if(error) {
            const missingTable = rememberUnavailableTable(error);
            if(!missingTable) console.log('Supabase saveControl error:', error.message);
        } else {
            const mapped = mapDbControl(data);
            memoryControls.set(phoneNumber, mapped);
            return mapped;
        }
    }

    return saveMemoryControl(phoneNumber, next);
}

const takeControl = (phoneNumber, payload = {}) => saveControl(phoneNumber, {
    mode: 'human',
    takenBy: payload.takenBy || 'Dashboard',
    reason: payload.reason || '',
    takenAt: new Date().toISOString(),
    releasedAt: null,
    assistedFlow: null
});

const releaseControl = (phoneNumber) => saveControl(phoneNumber, {
    mode: 'bot',
    releasedAt: new Date().toISOString(),
    assistedFlow: null
});

const startAssistedFlow = (phoneNumber, flow) => saveControl(phoneNumber, {
    mode: 'assisted_flow',
    assistedFlow: flow,
    takenBy: 'Dashboard',
    takenAt: new Date().toISOString(),
    releasedAt: null
});

const returnToHuman = (phoneNumber) => saveControl(phoneNumber, {
    mode: 'human',
    assistedFlow: null
});

module.exports = {
    getControl,
    takeControl,
    releaseControl,
    startAssistedFlow,
    returnToHuman
};
