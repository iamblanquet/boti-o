const FunnelRepository = require('./funnelRepository');

const STAGES = {
    CONTACTED: 'contacted',
    APPOINTMENT_CREATED: 'appointment_created',
    CAPTURED: 'captured'
};

const percentage = (value, total) => (
    total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0
);

const registerStageForPhone = async ({ phoneNumber, stage, occurredAt, appointmentId }) => {
    const lead = await FunnelRepository.findLeadForPhone(phoneNumber, occurredAt);
    if(!lead) return false;

    return FunnelRepository.registerEvent({
        campaignId: lead.campaignId,
        phoneNumber,
        stage,
        occurredAt,
        appointmentId
    });
};

const markContacted = (phoneNumber, occurredAt = new Date().toISOString()) => (
    registerStageForPhone({
        phoneNumber,
        stage: STAGES.CONTACTED,
        occurredAt
    })
);

const recordAppointment = async (appointment) => {
    if(!appointment?.phoneNumber || !appointment?.id) return false;

    const occurredAt = appointment.createdAt || appointment.updatedAt || new Date().toISOString();
    await registerStageForPhone({
        phoneNumber: appointment.phoneNumber,
        stage: STAGES.APPOINTMENT_CREATED,
        occurredAt,
        appointmentId: appointment.id
    });

    if(appointment.status === 'confirmada') {
        await registerStageForPhone({
            phoneNumber: appointment.phoneNumber,
            stage: STAGES.CAPTURED,
            occurredAt: appointment.confirmedAt || appointment.updatedAt || occurredAt,
            appointmentId: appointment.id
        });
    }

    return true;
};

const attachMetrics = async (campaigns) => {
    const leadDetails = await FunnelRepository.getLeadDetailsByCampaign(
        campaigns.map((campaign) => campaign.id)
    );

    return campaigns.map((campaign) => {
        const leadsCount = Number(campaign.leadsCount || 0);
        const leads = leadDetails.get(campaign.id) || [];
        const counts = {
            contactedCount: leads.filter((lead) => lead.contacted).length,
            appointmentsCount: leads.filter((lead) => lead.appointmentCreated).length,
            capturedCount: leads.filter((lead) => lead.captured).length
        };
        const detailAwareLeadsCount = Math.max(leadsCount, leads.length);

        return {
            ...campaign,
            funnel: {
                leadsCount: detailAwareLeadsCount,
                leadsRate: detailAwareLeadsCount > 0 ? 100 : 0,
                ...counts,
                contactedRate: percentage(counts.contactedCount, detailAwareLeadsCount),
                appointmentsRate: percentage(counts.appointmentsCount, detailAwareLeadsCount),
                capturedRate: percentage(counts.capturedCount, detailAwareLeadsCount),
                leads
            },
            metrics: {
                total_leads: detailAwareLeadsCount,
                contacted: counts.contactedCount,
                appointments: counts.appointmentsCount,
                captured: counts.capturedCount
            }
        };
    });
};

module.exports = {
    STAGES,
    percentage,
    markContacted,
    recordAppointment,
    attachMetrics
};
