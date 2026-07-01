const getSupabase = require('../config/supabase');

const DASHBOARD_MESSAGES_LIMIT = Number(process.env.DASHBOARD_MESSAGES_LIMIT || 300);

const getDashboardMessagesLimit = () => (
    Number.isFinite(DASHBOARD_MESSAGES_LIMIT) && DASHBOARD_MESSAGES_LIMIT > 0
        ? Math.floor(DASHBOARD_MESSAGES_LIMIT)
        : 300
);

const isEnabled = () => Boolean(getSupabase());

const upsertConversation = async (conversation) => {
    const supabase = getSupabase();
    if(!supabase) return;

    const payload = {
        phone_number: conversation.phoneNumber,
        name: conversation.name || null,
        last_message: conversation.lastMessage || '',
        last_at: conversation.lastAt || new Date().toISOString(),
        last_direction: conversation.lastDirection || null,
        incoming_count: conversation.incomingCount || 0,
        outgoing_count: conversation.outgoingCount || 0,
        unread_count: conversation.unread || 0
    };

    const { error } = await supabase.from('conversations').upsert(payload, {
        onConflict: 'phone_number'
    });
    if(error) {
        console.log('Supabase upsertConversation error:', error.message);
        throw error;
    }
}

const insertMessage = async (message) => {
    const supabase = getSupabase();
    if(!supabase) return;

    const payload = {
        message_id: message.id,
        phone_number: message.phoneNumber,
        direction: message.direction,
        source: message.source,
        type: message.type,
        text: message.text || '',
        metadata: message.metadata || {},
        created_at: message.createdAt || new Date().toISOString()
    };

    const { error } = await supabase.from('messages').upsert(payload, {
        onConflict: 'message_id'
    });
    if(error) {
        console.log('Supabase insertMessage error:', error.message);
        throw error;
    }
}

const getConversations = async () => {
    const supabase = getSupabase();
    if(!supabase) return null;

    const { data, error } = await supabase
        .from('conversations')
        .select('phone_number,name,last_message,last_at,last_direction,incoming_count,outgoing_count,unread_count,created_at')
        .order('last_at', { ascending: false });

    if(error) {
        console.log('Supabase getConversations error:', error.message);
        return null;
    }

    return (data || []).map((conversation) => ({
        phoneNumber: conversation.phone_number,
        name: conversation.name,
        lastMessage: conversation.last_message,
        lastAt: conversation.last_at,
        lastDirection: conversation.last_direction,
        incomingCount: conversation.incoming_count,
        outgoingCount: conversation.outgoing_count,
        messageCount: (conversation.incoming_count || 0) + (conversation.outgoing_count || 0),
        createdAt: conversation.created_at,
        unread: conversation.unread_count
    }));
}

const getMessages = async (phoneNumber) => {
    const supabase = getSupabase();
    if(!supabase) return null;

    const { data, error } = await supabase
        .from('messages')
        .select('message_id,phone_number,direction,source,type,text,metadata,created_at')
        .eq('phone_number', phoneNumber)
        .order('created_at', { ascending: false })
        .limit(getDashboardMessagesLimit());

    if(error) {
        console.log('Supabase getMessages error:', error.message);
        return null;
    }

    await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('phone_number', phoneNumber);

    return (data || []).slice().reverse().map((message) => ({
        id: message.message_id,
        phoneNumber: message.phone_number,
        direction: message.direction,
        source: message.source,
        type: message.type,
        text: message.text,
        metadata: message.metadata || {},
        createdAt: message.created_at
    }));
}

module.exports = {
    isEnabled,
    upsertConversation,
    insertMessage,
    getConversations,
    getMessages
};
