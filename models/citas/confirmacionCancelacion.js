const { formatHumanDateTime } = require('../../utils/dateTime');
const { createIcsFile, getShortGoogleCalendarUrl } = require('../../utils/calendarInvite');
const {
    cancelAppointmentEvent,
    updateAppointmentEvent
} = require('../googleCalendar');
const {
    saveFlow,
    clearFlow,
    saveAppointment,
    getAppointment,
    getLatestActiveAppointment
} = require('./almacenamiento');
const Messages = require('../messages');
const {
    FLOW_MODE_CANCEL,
    isAffirmative,
    hasCancelIntent
} = require('./reglas');
const { sendButtonMessage } = require('./mensajesWhatsapp');

const sendTextMessage = (phoneNumber, message) => Messages.sendTextMessage(message, phoneNumber);

const sendCalendarInvite = async (phoneNumber, appointment) => {
    const googleCalendarUrl = await getShortGoogleCalendarUrl(appointment);
    await Messages.sendTextMessage(
        `Puedes agregar tu cita a Google Calendar desde aqui:\n${googleCalendarUrl}`,
        phoneNumber,
        { hasUrl: true }
    );

    if(!process.env.PUBLIC_BASE_URL) return;

    const invite = createIcsFile(appointment);
    const link = `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/mediaFiles/${invite.publicPath}`;
    await Messages.sendMessage({
        phoneNumber,
        type: 'document',
        text: 'Tambien te compartimos la invitacion de calendario para guardarla en tu dispositivo.',
        document: {
            link,
            filename: invite.filename
        },
        source: 'bot'
    });
}

const sendConfirmButtons = async (phoneNumber, appointmentId, text) => sendButtonMessage(phoneNumber, `${text}\n\nMe confirmas tu asistencia, por favor?`, [
    { id: `appt_confirm_${appointmentId}`, title: 'Confirmo' },
    { id: `appt_cancel_${appointmentId}`, title: 'Cancelar' }
]);

const confirmAppointmentById = async (phoneNumber, appointmentId) => {
    await clearFlow(phoneNumber);

    const appointment = appointmentId ? await getAppointment(appointmentId) : null;
    if(!appointment || appointment.phoneNumber !== phoneNumber || !['pendiente', 'confirmada'].includes(appointment.status)) {
        await sendTextMessage(phoneNumber, 'No encontre esa cita activa para confirmar. Si quieres, revisamos los datos con el equipo.');
        return true;
    }

    const confirmedAppointment = await saveAppointment({ ...appointment, status: 'confirmada', confirmedAt: new Date().toISOString() });
    if(confirmedAppointment.eventId) {
        try {
            await updateAppointmentEvent({
                eventId: confirmedAppointment.eventId,
                appointment: confirmedAppointment,
                start: new Date(confirmedAppointment.startAt),
                end: new Date(confirmedAppointment.endAt)
            });
        } catch (error) {
            console.error('No se pudo sincronizar la confirmacion con Google Calendar:', error.message);
        }
    }
    await sendTextMessage(phoneNumber, `Gracias. Tu cita queda confirmada para ${formatHumanDateTime(appointment.startAt)}. Te esperamos con mucho gusto.`);
    await sendCalendarInvite(phoneNumber, confirmedAppointment);

    // Invitar a registrar datos de promociones (correo y cumpleaños) si aplica
    const PromoFlow = require('./promoFlow');
    await PromoFlow.iniciarSiAplica(phoneNumber);

    return true;
}

const cancelAppointmentById = async (phoneNumber, appointmentId, options = {}) => {
    await clearFlow(phoneNumber);

    const appointment = appointmentId ? await getAppointment(appointmentId) : null;
    if(!appointment || appointment.phoneNumber !== phoneNumber || !['pendiente', 'confirmada'].includes(appointment.status)) {
        await sendTextMessage(phoneNumber, 'No encontre esa cita activa para cancelar. Si quieres, lo revisamos con el equipo.');
        return true;
    }

    if(appointment.eventId) await cancelAppointmentEvent(appointment.eventId);
    await saveAppointment({ ...appointment, status: 'cancelada' });
    await sendTextMessage(phoneNumber, options.message || 'Listo, ya cancele tu cita. Cuando quieras, te ayudo a encontrar otro horario.');
    return true;
}

const confirmLatestAppointment = async (phoneNumber) => {
    const appointment = await getLatestActiveAppointment(phoneNumber);
    if(!appointment) {
        await sendTextMessage(phoneNumber, 'No encontre una cita activa para confirmar. Si quieres, revisamos los datos con el equipo.');
        return true;
    }

    return confirmAppointmentById(phoneNumber, appointment.id);
}

const continueCancelFlow = async (phoneNumber, message, flow) => {
    const appointment = flow.appointmentId
        ? await getAppointment(flow.appointmentId)
        : await getLatestActiveAppointment(phoneNumber);
    await clearFlow(phoneNumber);

    if(!appointment || appointment.phoneNumber !== phoneNumber || !['pendiente', 'confirmada'].includes(appointment.status)) {
        await sendTextMessage(phoneNumber, 'No encontre una cita activa para cancelar con este numero. Si la hiciste con otro telefono, te ayudo a revisarlo con el equipo.');
        return true;
    }

    if(isAffirmative(message) || hasCancelIntent(message)) {
        if(appointment.eventId) await cancelAppointmentEvent(appointment.eventId);
        await saveAppointment({ ...appointment, status: 'cancelada' });
        await sendTextMessage(phoneNumber, 'Listo, ya cancele tu cita. Cuando quieras, te ayudo a encontrar otro horario.');
        return true;
    }

    await sendTextMessage(phoneNumber, 'Perfecto, dejamos tu cita como estaba. Te esperamos con gusto.');
    return true;
}

const startCancelFlow = async (phoneNumber) => {
    const appointment = await getLatestActiveAppointment(phoneNumber);
    if(!appointment) {
        await sendTextMessage(phoneNumber, 'No encontre una cita activa para cancelar con este numero. Si la hiciste con otro telefono, te ayudo a revisarlo con el equipo.');
        return true;
    }

    await saveFlow(phoneNumber, { mode: FLOW_MODE_CANCEL, appointmentId: appointment.id, data: {} });
    await sendButtonMessage(phoneNumber, `Claro, te ayudo. Tengo registrada tu cita de ${appointment.serviceName} para ${formatHumanDateTime(appointment.startAt)}.\n\nQuieres que la cancele y libere ese espacio en calendario?`, [
        { id: 'appt_cancel_confirm', title: 'Si, cancelar' },
        { id: 'appt_keep', title: 'Conservar' }
    ]);
    return true;
}

module.exports = {
    sendConfirmButtons,
    confirmAppointmentById,
    cancelAppointmentById,
    confirmLatestAppointment,
    continueCancelFlow,
    startCancelFlow
};
