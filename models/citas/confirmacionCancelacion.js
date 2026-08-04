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
    getUpcomingActiveAppointments
} = require('./almacenamiento');
const Messages = require('../messages');
const {
    FLOW_MODE_CANCEL,
    isAffirmative,
    hasCancelIntent
} = require('./reglas');
const { sendButtonMessage } = require('./mensajesWhatsapp');
const { getMessage } = require('../../utils/systemMessageLoader');

const sendTextMessage = (phoneNumber, message) => Messages.sendTextMessage(message, phoneNumber);

const sendAppointmentConfirmationCare = async (phoneNumber) => {
    const message = getMessage('appointment_confirmation_care');
    if(message.trim()) await sendTextMessage(phoneNumber, message);
};

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

const isEligibleAppointment = (appointment, phoneNumber) => {
    if(!appointment || appointment.phoneNumber !== phoneNumber) return false;
    if(!['pendiente', 'confirmada'].includes(appointment.status)) return false;
    const endAt = new Date(appointment.endAt || appointment.startAt);
    return !Number.isNaN(endAt.getTime()) && endAt >= new Date();
};

const sendAppointmentSelection = async (phoneNumber, appointments, action) => {
    const verb = action === 'cancel' ? 'cancelar' : 'confirmar';
    const buttons = appointments.map((appointment) => ({
        id: `${action === 'cancel' ? 'appt_cancel' : 'appt_confirm'}_${appointment.id}`,
        title: `${appointment.serviceName || 'Cita'} ${new Date(appointment.startAt).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })}`.slice(0, 20)
    }));
    const { sendButtonGroups } = require('./mensajesWhatsapp');
    await sendButtonGroups(phoneNumber, `Tienes varias citas proximas. Selecciona cual deseas ${verb}:`, buttons);
    return true;
};

const confirmAppointmentById = async (phoneNumber, appointmentId) => {
    await clearFlow(phoneNumber);

    const appointment = appointmentId ? await getAppointment(appointmentId) : null;
    if(!isEligibleAppointment(appointment, phoneNumber)) {
        await sendTextMessage(phoneNumber, 'No encontre esa cita activa para confirmar. Si quieres, revisamos los datos con el equipo.');
        return true;
    }

    if(appointment.status === 'confirmada') {
        await sendTextMessage(phoneNumber, `Tu cita ya estaba confirmada para ${formatHumanDateTime(appointment.startAt)}. Te esperamos con mucho gusto.`);
        return true;
    }

    const confirmedAppointment = await saveAppointment({
        ...appointment,
        status: 'confirmada',
        confirmedAt: new Date().toISOString(),
        reminders: {
            ...(appointment.reminders || {}),
            postAppointmentCareDueAt: appointment.endAt
        }
    });
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
    try {
        await sendCalendarInvite(phoneNumber, confirmedAppointment);
    } catch (error) {
        console.error('No se pudo enviar la invitacion de calendario:', error.message);
    }

    // Enviar recomendaciones y ofrecer el registro de promociones si aplica.
    await sendAppointmentConfirmationCare(phoneNumber);

    const PromoFlow = require('./promoFlow');
    await PromoFlow.iniciarSiAplica(phoneNumber);

    return true;
}

const cancelAppointmentById = async (phoneNumber, appointmentId, options = {}) => {
    await clearFlow(phoneNumber);

    const appointment = appointmentId ? await getAppointment(appointmentId) : null;
    if(!isEligibleAppointment(appointment, phoneNumber)) {
        await sendTextMessage(phoneNumber, 'No encontre esa cita activa para cancelar. Si quieres, lo revisamos con el equipo.');
        return true;
    }

    let calendarSyncStatus = 'not-required';
    if(appointment.eventId) {
        try {
            await cancelAppointmentEvent(appointment.eventId);
            calendarSyncStatus = 'synced';
        } catch (error) {
            calendarSyncStatus = 'pending-delete';
            console.error('No se pudo eliminar el evento de Calendar:', error.message);
        }
    }
    await saveAppointment({ ...appointment, status: 'cancelada', calendarSyncStatus });
    await sendTextMessage(phoneNumber, options.message || 'Listo, ya cancele tu cita. Cuando quieras, te ayudo a encontrar otro horario.');
    return true;
}

const confirmLatestAppointment = async (phoneNumber) => {
    const appointments = await getUpcomingActiveAppointments(phoneNumber);
    if(!appointments.length) {
        await sendTextMessage(phoneNumber, 'No encontre una cita activa para confirmar. Si quieres, revisamos los datos con el equipo.');
        return true;
    }
    if(appointments.length > 1) return sendAppointmentSelection(phoneNumber, appointments, 'confirm');
    return confirmAppointmentById(phoneNumber, appointments[0].id);
}

const continueCancelFlow = async (phoneNumber, message, flow) => {
    const appointment = flow.appointmentId
        ? await getAppointment(flow.appointmentId)
        : await getLatestActiveAppointment(phoneNumber);
    await clearFlow(phoneNumber);

    if(!isEligibleAppointment(appointment, phoneNumber)) {
        await sendTextMessage(phoneNumber, 'No encontre una cita activa para cancelar con este numero. Si la hiciste con otro telefono, te ayudo a revisarlo con el equipo.');
        return true;
    }

    if(isAffirmative(message) || hasCancelIntent(message)) {
        return cancelAppointmentById(phoneNumber, appointment.id);
    }

    await sendTextMessage(phoneNumber, 'Perfecto, dejamos tu cita como estaba. Te esperamos con gusto.');
    return true;
}

const startCancelFlow = async (phoneNumber) => {
    const appointments = await getUpcomingActiveAppointments(phoneNumber);
    if(!appointments.length) {
        await sendTextMessage(phoneNumber, 'No encontre una cita activa para cancelar con este numero. Si la hiciste con otro telefono, te ayudo a revisarlo con el equipo.');
        return true;
    }

    if(appointments.length > 1) return sendAppointmentSelection(phoneNumber, appointments, 'cancel');
    const appointment = appointments[0];

    await saveFlow(phoneNumber, { mode: FLOW_MODE_CANCEL, appointmentId: appointment.id, data: {} });
    await sendButtonMessage(phoneNumber, `Claro, te ayudo. Tengo registrada tu cita de ${appointment.serviceName} para ${formatHumanDateTime(appointment.startAt)}.\n\nQuieres que la cancele y libere ese espacio en calendario?`, [
        { id: 'appt_cancel_confirm', title: 'Si, cancelar' },
        { id: 'appt_keep', title: 'Conservar' }
    ]);
    return true;
}

module.exports = {
    sendConfirmButtons,
    sendAppointmentConfirmationCare,
    confirmAppointmentById,
    cancelAppointmentById,
    confirmLatestAppointment,
    continueCancelFlow,
    startCancelFlow
};
