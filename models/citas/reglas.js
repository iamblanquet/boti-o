const { normalizeText } = require('../../utils/configCitas');
const { hasTwoParticipantNames } = require('./participantes');

const FLOW_MODE_CREATE = 'create';
const FLOW_MODE_RESCHEDULE = 'reschedule';
const FLOW_MODE_CANCEL = 'confirm-cancel';
const FLOW_MODE_PENDING_CONFIRMATION = 'pending-confirmation';

const APPOINTMENT_DURATION_MINUTES = Number(process.env.APPOINTMENT_DURATION_MINUTES || 60);
const APPOINTMENT_SLOT_STEP_MINUTES = Number(process.env.APPOINTMENT_SLOT_STEP_MINUTES || 60);
const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const hasAppointmentIntent = (message) => {
    const value = normalizeText(message);
    return [
        'agendar', 'agendar cita', 'agenda una cita', 'quiero agendar',
        'cita', 'reservar', 'reservar cita', 'hacer cita', 'programar',
        'quiero ir', 'puedo ir', 'pueden atender', 'disponibilidad para',
        'hay espacio', 'tienen espacio', 'tienen cita', 'pueden el'
    ].some((keyword) => value.includes(keyword));
}

const hasAvailabilityIntent = (message) => {
    const value = normalizeText(message);
    return [
        'disponibilidad', 'disponible', 'disponibles', 'libre', 'libres',
        'espacio', 'espacios', 'cupo', 'cupos', 'horario', 'horarios',
        'que horas', 'a que hora', 'hay lugar', 'tienen lugar', 'agenda disponible'
    ].some((keyword) => value.includes(keyword));
}

const hasRescheduleIntent = (message) => {
    const value = normalizeText(message);
    return ['reprogramar', 'cambiar cita', 'cambiar mi cita', 'mover mi cita', 'cambiar la cita'].some((keyword) => value.includes(keyword));
}

const hasCancelIntent = (message) => {
    const value = normalizeText(message);
    return [
        'cancelar',
        'cancelar cita',
        'cancelar mi cita',
        'cancelar la cita',
        'cancela mi cita',
        'cancela la cita',
        'quiero cancelar',
        'necesito cancelar',
        'anular cita',
        'anular mi cita',
        'eliminar mi cita',
        'borrar mi cita',
        'ya no puedo asistir',
        'no puedo asistir',
        'no voy a poder asistir',
        'no podre asistir',
        'no podre ir',
        'no puedo ir'
    ].some((keyword) => value.includes(keyword));
}

const hasConfirmIntent = (message) => {
    const value = normalizeText(message);
    return ['confirmo', 'confirmar', 'confirmar cita', 'si confirmo', 'confirmada'].some((keyword) => value.includes(keyword));
}

const isAffirmative = (message) => ['si', 'confirmo', 'correcto', 'ok', 'vale', 'appt_confirm', 'appt_cancel_confirm'].includes(normalizeText(message));
const isNegative = (message) => ['no', 'cancelar', 'mejor no', 'appt_cancel', 'appt_keep'].includes(normalizeText(message));

const parseAppointmentActionPayload = (message) => {
    const value = String(message || '').trim();
    const confirmMatch = value.match(/^appt_confirm_([a-f0-9-]+)$/i);
    const cancelMatch = value.match(/^appt_cancel_([a-f0-9-]+)$/i);

    return {
        confirmAppointmentId: confirmMatch ? confirmMatch[1] : null,
        cancelAppointmentId: cancelMatch ? cancelMatch[1] : null
    };
}

const parseAppointmentButtonPayload = (message) => {
    const value = String(message || '').trim();
    const categoryMatch = value.match(/^appt_category_([a-z0-9-]+)$/);
    const serviceMatch = value.match(/^appt_service_([a-z0-9-]+)$/);
    const dateMatch = value.match(/^appt_date_(\d{4}-\d{2}-\d{2})$/);
    const timeMatch = value.match(/^appt_time_(\d{2})-(\d{2})$/);
    const peopleMatch = value.match(/^appt_people_(\d+)$/);
    const datesPageMatch = value.match(/^appt_dates_page_(\d+)$/);

    return {
        categoryId: categoryMatch ? categoryMatch[1] : null,
        serviceId: serviceMatch ? serviceMatch[1] : null,
        date: dateMatch ? dateMatch[1] : null,
        time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null,
        people: peopleMatch ? Number(peopleMatch[1]) : null,
        datesPage: datesPageMatch ? Number(datesPageMatch[1]) : null
    };
}

const getBookingDuration = (data) => {
    return data.durationMinutes
        ? Math.max(data.durationMinutes, APPOINTMENT_DURATION_MINUTES)
        : APPOINTMENT_DURATION_MINUTES;
}

const nextMissingField = (data) => {
    if(!data.serviceId) return 'service';
    if(!data.date) return 'date';
    if(!data.time) return 'time';
    if(!data.people) return 'people';
    if(data.people === 2 && !hasTwoParticipantNames(data.participantNames)) return 'participantNames';
    if(!data.name) return 'name';
    return null;
}

const hasExpectedField = (field, data) => {
    const checks = {
        service: Boolean(data.serviceId),
        date: Boolean(data.date),
        time: Boolean(data.time),
        people: Boolean(data.people),
        participantNames: hasTwoParticipantNames(data.participantNames),
        name: Boolean(data.name)
    };

    return Boolean(checks[field]);
}

const hasAnyAppointmentData = (data) => Boolean(data?.serviceId || data?.people || data?.date || data?.time || data?.name || data?.participantNames);

module.exports = {
    FLOW_MODE_CREATE,
    FLOW_MODE_RESCHEDULE,
    FLOW_MODE_CANCEL,
    FLOW_MODE_PENDING_CONFIRMATION,
    APPOINTMENT_DURATION_MINUTES,
    APPOINTMENT_SLOT_STEP_MINUTES,
    WEEKDAY_NAMES,
    hasAppointmentIntent,
    hasAvailabilityIntent,
    hasRescheduleIntent,
    hasCancelIntent,
    hasConfirmIntent,
    isAffirmative,
    isNegative,
    parseAppointmentActionPayload,
    parseAppointmentButtonPayload,
    getBookingDuration,
    nextMissingField,
    hasExpectedField,
    hasAnyAppointmentData
};
