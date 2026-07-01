const getSupabase = require('../config/supabase');

const memorySummaries = new Map();
let dbUnavailable = false;

const isEnabled = () => Boolean(getSupabase()) && !dbUnavailable;

const mapDbSummary = (row) => {
    if(!row) return null;
    return {
        phoneNumber: row.phone_number,
        summary: row.summary || '',
        intent: row.intent || 'otro',
        sentiment: row.sentiment || 'neutral',
        nextStep: row.next_step || '',
        highlights: row.highlights || [],
        customerContext: row.customer_context || {},
        pendingMessageCount: row.pending_message_count || 0,
        detailedContext: row.detailed_context || null,
        detailedContextUpdatedAt: row.detailed_context_updated_at || null,
        status: row.status || 'active',
        lastSummarizedAt: row.last_summarized_at,
        lastMessageCreatedAt: row.last_message_created_at,
        generatedAt: row.generated_at,
        updatedAt: row.updated_at
    };
}

const getMemorySummary = (phoneNumber) => memorySummaries.get(phoneNumber) || null;

const rememberUnavailableTable = (error) => {
    const message = String(error?.message || '').toLowerCase();
    if(
        error?.code === '42P01' ||
        error?.code === 'PGRST205' ||
        error?.code === 'PGRST204' ||
        message.includes('chat_summaries') ||
        message.includes('detailed_context')
    ) {
        dbUnavailable = true;
        return true;
    }
    return false;
}

const getLatestSummary = async (phoneNumber) => {
    if(!phoneNumber) return null;

    if(isEnabled()) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('chat_summaries')
            .select('*')
            .eq('phone_number', phoneNumber)
            .maybeSingle();

        if(error) {
            const missingTable = rememberUnavailableTable(error);
            if(!missingTable) console.log('Supabase getLatestSummary error:', error.message);
        } else {
            return mapDbSummary(data);
        }
    }

    return getMemorySummary(phoneNumber);
}

const saveMemorySummary = (phoneNumber, payload) => {
    const previous = getMemorySummary(phoneNumber) || {};
    const now = new Date().toISOString();
    const summary = {
        phoneNumber,
        summary: payload.summary || previous.summary || '',
        intent: payload.intent || previous.intent || 'otro',
        sentiment: payload.sentiment || previous.sentiment || 'neutral',
        nextStep: payload.nextStep || previous.nextStep || '',
        highlights: Array.isArray(payload.highlights) ? payload.highlights : previous.highlights || [],
        customerContext: payload.customerContext || previous.customerContext || {},
        pendingMessageCount: payload.pendingMessageCount ?? previous.pendingMessageCount ?? 0,
        detailedContext: payload.detailedContext !== undefined ? payload.detailedContext : previous.detailedContext || null,
        detailedContextUpdatedAt: payload.detailedContextUpdatedAt !== undefined ? payload.detailedContextUpdatedAt : previous.detailedContextUpdatedAt || null,
        status: payload.status || previous.status || 'active',
        lastSummarizedAt: payload.lastSummarizedAt || previous.lastSummarizedAt || now,
        lastMessageCreatedAt: payload.lastMessageCreatedAt || previous.lastMessageCreatedAt || null,
        generatedAt: payload.generatedAt || previous.generatedAt || now,
        updatedAt: now
    };
    memorySummaries.set(phoneNumber, summary);
    return summary;
}

const saveSummary = async (phoneNumber, payload) => {
    if(!phoneNumber) return null;
    const now = new Date().toISOString();
    const nextPayload = {
        ...payload,
        pendingMessageCount: payload.pendingMessageCount ?? 0,
        status: payload.status || 'active',
        lastSummarizedAt: payload.lastSummarizedAt || now,
        generatedAt: payload.generatedAt || now
    };

    if(isEnabled()) {
        const supabase = getSupabase();
        const dbPayload = {
            phone_number: phoneNumber,
            summary: nextPayload.summary || '',
            intent: nextPayload.intent || 'otro',
            sentiment: nextPayload.sentiment || 'neutral',
            next_step: nextPayload.nextStep || '',
            highlights: Array.isArray(nextPayload.highlights) ? nextPayload.highlights : [],
            customer_context: nextPayload.customerContext || {},
            pending_message_count: nextPayload.pendingMessageCount,
            detailed_context: nextPayload.detailedContext || null,
            detailed_context_updated_at: nextPayload.detailedContextUpdatedAt || null,
            status: nextPayload.status,
            last_summarized_at: nextPayload.lastSummarizedAt,
            last_message_created_at: nextPayload.lastMessageCreatedAt || null,
            generated_at: nextPayload.generatedAt,
            updated_at: now
        };

        const { data, error } = await supabase
            .from('chat_summaries')
            .upsert(dbPayload, { onConflict: 'phone_number' })
            .select('*')
            .maybeSingle();

        if(error) {
            const missingTable = rememberUnavailableTable(error);
            if(!missingTable) console.log('Supabase saveSummary error:', error.message);
        } else {
            const mapped = mapDbSummary(data);
            memorySummaries.set(phoneNumber, mapped);
            return mapped;
        }
    }

    return saveMemorySummary(phoneNumber, nextPayload);
}

const incrementPending = async (phoneNumber, messageCreatedAt = null) => {
    if(!phoneNumber) return null;
    const previous = await getLatestSummary(phoneNumber);
    const nextCount = (previous?.pendingMessageCount || 0) + 1;
    return saveSummary(phoneNumber, {
        ...(previous || {}),
        summary: previous?.summary || '',
        pendingMessageCount: nextCount,
        status: previous?.summary ? 'active' : 'pending',
        lastMessageCreatedAt: messageCreatedAt || previous?.lastMessageCreatedAt || null,
        lastSummarizedAt: previous?.lastSummarizedAt || null,
        generatedAt: previous?.generatedAt || null
    });
}

const getDetailedContext = async (phoneNumber) => {
    const summary = await getLatestSummary(phoneNumber);
    if(!summary?.detailedContext) return null;
    return {
        ...summary.detailedContext,
        updatedAt: summary.detailedContextUpdatedAt || summary.updatedAt || null
    };
}

const saveDetailedContext = async (phoneNumber, detailedContext) => {
    if(!phoneNumber || !detailedContext) return null;
    const previous = await getLatestSummary(phoneNumber);
    const updatedAt = new Date().toISOString();
    const summary = await saveSummary(phoneNumber, {
        ...(previous || {}),
        summary: previous?.summary || '',
        detailedContext,
        detailedContextUpdatedAt: updatedAt,
        pendingMessageCount: previous?.pendingMessageCount || 0,
        status: previous?.status || 'active',
        lastSummarizedAt: previous?.lastSummarizedAt || null,
        generatedAt: previous?.generatedAt || updatedAt
    });

    return {
        ...summary.detailedContext,
        updatedAt: summary.detailedContextUpdatedAt
    };
}

module.exports = {
    getLatestSummary,
    saveSummary,
    incrementPending,
    getDetailedContext,
    saveDetailedContext
};
