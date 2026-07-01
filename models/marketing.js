const ChatStore = require('./chatStore');
const CitasStorage = require('./citas/almacenamiento');

// Get all unique phone numbers from the chat history
const getAllLeads = async () => {
    const conversations = await ChatStore.getConversationsAsync();
    return conversations.map(c => c.phoneNumber);
};

// Get users who had a confirmed appointment within the last 'days'
const getRecentlyConfirmed = async (daysAgo, serviceIds = []) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    const conversations = await ChatStore.getConversationsAsync();
    const recentlyConfirmedLeads = [];
    
    for (const conv of conversations) {
        const phone = conv.phoneNumber;
        const apts = await CitasStorage.getCustomerAppointments(phone) || [];
        const phoneClean = phone.replace('@c.us', '');
        const aptsClean = await CitasStorage.getCustomerAppointments(phoneClean) || [];
        
        const allApts = [...apts, ...aptsClean];
        const hasRecentConfirmed = allApts.some(apt => {
            if (apt.status !== 'confirmada') return false;
            
            // Si hay filtro de servicios, la cita debe pertenecer a uno de ellos
            if (serviceIds && serviceIds.length > 0) {
                const matchId = serviceIds.includes(String(apt.serviceId));
                const matchName = serviceIds.includes(apt.serviceName);
                if (!matchId && !matchName) return false;
            }
            
            const aptDate = new Date(apt.startAt);
            return aptDate >= cutoff && aptDate <= now;
        });
        
        if (hasRecentConfirmed) {
            recentlyConfirmedLeads.push(phone);
        }
    }
    
    return recentlyConfirmedLeads;
};

// Get users who messaged in the last 'days' but do not have an active confirmed appointment
const getProbableAppointments = async (daysAgo, serviceIds = []) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    
    const conversations = await ChatStore.getConversationsAsync();
    const recentConversations = conversations.filter(c => {
        if (!c.lastAt) return false;
        const lastActivity = new Date(c.lastAt);
        return lastActivity >= cutoff;
    });

    const probableLeads = [];
    
    for (const conv of recentConversations) {
        const phone = conv.phoneNumber;
        // Check if they have an active appointment
        const apts = await CitasStorage.getCustomerAppointments(phone) || [];
        const phoneClean = phone.replace('@c.us', '');
        const aptsClean = await CitasStorage.getCustomerAppointments(phoneClean) || [];
        
        const allApts = [...apts, ...aptsClean];
        // Consider an appointment 'active' only if it is scheduled for the future
        const hasActive = allApts.some(apt => ['pendiente', 'confirmada'].includes(apt.status) && new Date(apt.startAt) >= now);
        
        // If they want to filter by service for "probable", it's harder because probable means NO appointment.
        // We could filter by what they talked about, but for now we just return those with no active appt.
        if (!hasActive) {
            probableLeads.push(phone);
        }
    }
    
    return probableLeads;
};

// Segment audiences
const getAudience = async (segment, daysAgo = 2, serviceIds = []) => {
    switch (segment) {
        case 'recent_confirmed':
            return await getRecentlyConfirmed(daysAgo, serviceIds);
        case 'probable':
            return await getProbableAppointments(daysAgo, serviceIds);
        case 'all':
        default:
            return await getAllLeads();
    }
};

module.exports = {
    getAllLeads,
    getRecentlyConfirmed,
    getProbableAppointments,
    getAudience
};
