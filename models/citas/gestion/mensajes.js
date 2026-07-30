const { formatHumanDateTime } = require('../../../utils/dateTime');
const { sendButtonMessage, sendListMessage } = require('../mensajesWhatsapp');
const { getMessage } = require('../../../utils/systemMessageLoader');

const appointmentLabel = (appointment) => `${appointment.serviceName || 'Cita'} · ${formatHumanDateTime(appointment.startAt)}`;

const sendAppointmentSelection = async (phoneNumber, appointments) => sendListMessage(phoneNumber, {
    body: getMessage('management_select_appointments'),
    button: 'Ver mis citas',
    sectionTitle: 'Citas proximas',
    rows: appointments.map((appointment) => ({
        id: `appt_manage_select_${appointment.id}`,
        title: String(appointment.serviceName || 'Cita').slice(0, 24),
        description: formatHumanDateTime(appointment.startAt).slice(0, 72)
    }))
});

const sendActionMenu = async (phoneNumber, appointment) => sendButtonMessage(phoneNumber,
    getMessage('management_action_menu', {
        service: appointment.serviceName || 'Cita',
        datetime: formatHumanDateTime(appointment.startAt)
    }), [
    { id: `appt_manage_confirm_${appointment.id}`, title: 'Confirmar' },
    { id: `appt_manage_reschedule_${appointment.id}`, title: 'Cambiar horario' },
    { id: `appt_manage_cancel_${appointment.id}`, title: 'Cancelar cita' }
]);

const sendCancelConfirmation = async (phoneNumber, appointment) => sendButtonMessage(phoneNumber,
    getMessage('management_cancel_confirm', {
        service: appointment.serviceName || 'Cita',
        datetime: formatHumanDateTime(appointment.startAt)
    }), [
        { id: `appt_manage_cancel_yes_${appointment.id}`, title: 'Si, cancelar' },
        { id: `appt_manage_keep_${appointment.id}`, title: 'Conservar cita' }
    ]
);

const sendRescheduleConfirmation = async (phoneNumber, appointment, startAt) => sendButtonMessage(phoneNumber,
    getMessage('management_reschedule_confirm', {
        service: appointment.serviceName || 'Cita',
        datetime: formatHumanDateTime(startAt),
        people: `${Number(appointment.people || 1)} ${Number(appointment.people || 1) === 1 ? 'persona' : 'personas'}`
    }), [
    { id: `appt_manage_reschedule_yes_${appointment.id}`, title: 'Confirmar cambio' },
    { id: `appt_manage_keep_${appointment.id}`, title: 'Conservar cita' }
]);

module.exports = {
    appointmentLabel,
    sendAppointmentSelection,
    sendActionMenu,
    sendCancelConfirmation,
    sendRescheduleConfirmation
};
