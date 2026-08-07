const { BUSINESS_HOURS } = require('../../utils/configCitas');
const {
    combineDateTime,
    addMinutes,
    isWithinBusinessHours,
    formatDate,
    formatTime
} = require('../../utils/dateTime');
const {
    APPOINTMENT_SLOT_STEP_MINUTES,
    getBookingDuration
} = require('./reglas');
const { formatDayButtonTitle } = require('./formato');
const { checkAvailability } = require('./verificadorDisponibilidad');
const { listActiveAppointments } = require('./almacenamiento');

const findAvailableSlotsForDate = async (data, limit = 9, options = {}) => {
    if(!data.date) return [];

    const durationMinutes = getBookingDuration(data);
    const day = combineDateTime(data.date, '12:00').getDay();
    const hours = BUSINESS_HOURS[day];
    if(!hours) return [];

    const slots = [];
    const appointments = options.appointments || await listActiveAppointments();
    let current = combineDateTime(data.date, hours.start);
    const businessEnd = combineDateTime(data.date, hours.end);
    const now = new Date();

    while(addMinutes(current, durationMinutes) <= businessEnd && slots.length < limit) {
        const end = addMinutes(current, durationMinutes);

        if(current > now && isWithinBusinessHours(current, durationMinutes)) {
            const availability = await checkAvailability(current, end, {
                excludeAppointmentId: data.appointmentId,
                appointments
            });
            if(availability.available) {
                slots.push({
                    date: data.date,
                    time: formatTime(current),
                    start: current,
                    availabilitySource: availability.source
                });
            }
        }

        current = addMinutes(current, APPOINTMENT_SLOT_STEP_MINUTES);
    }

    return slots;
}

const getCandidateBusinessDates = (now = new Date(), daysToCheck = 30) => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = [];

    for(let offset = 0; offset < daysToCheck; offset += 1) {
        const date = new Date(today);
        date.setDate(date.getDate() + offset);
        if(BUSINESS_HOURS[date.getDay()]) days.push(date);
    }

    return days;
}

const findAvailableDaysThisWeek = async (data, options = {}) => {
    const candidateDates = getCandidateBusinessDates(options.now, options.daysToCheck || 30);
    const maxResults = options.maxResults || 10;
    const appointments = options.appointments || await listActiveAppointments();
    const days = [];

    for(const date of candidateDates) {
        if(days.length >= maxResults) break;

        const dateText = formatDate(date);
        const slots = await findAvailableSlotsForDate(
            { ...data, date: dateText },
            1,
            { appointments }
        );
        if(slots.length) {
            days.push({
                date: dateText,
                title: formatDayButtonTitle(dateText)
            });
        }
    }

    return days;
}

module.exports = {
    findAvailableSlotsForDate,
    findAvailableDaysThisWeek,
    getCandidateBusinessDates
};
