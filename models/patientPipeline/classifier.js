const { STAGES } = require('./stages');

const parseDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const isConfirmed = (appointment) => (
    String(appointment?.status || '').trim().toLowerCase() === 'confirmada'
);

const getAutomaticStage = ({ conversation = {}, appointments = [], now = new Date() } = {}) => {
    const currentTime = now instanceof Date ? now : new Date(now);
    const confirmed = (appointments || [])
        .filter(isConfirmed)
        .map((appointment) => ({
            ...appointment,
            startDate: parseDate(appointment.startAt),
            endDate: parseDate(appointment.endAt)
        }))
        .filter((appointment) => appointment.startDate && appointment.endDate);

    if (confirmed.some((appointment) => appointment.startDate <= currentTime && currentTime <= appointment.endDate)) {
        return STAGES.TREATMENT_IN_PROGRESS;
    }

    if (confirmed.some((appointment) => appointment.startDate > currentTime)) {
        return STAGES.APPOINTMENT_SCHEDULED;
    }

    if (confirmed.some((appointment) => appointment.endDate < currentTime)) {
        return STAGES.FOLLOW_UP;
    }

    if (Number(conversation.outgoingCount || 0) > 0 || conversation.lastDirection === 'out') {
        return STAGES.CONTACTED;
    }

    return STAGES.LEAD;
};

module.exports = {
    getAutomaticStage
};
