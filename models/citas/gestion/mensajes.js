const { formatHumanDateTime } = require('../../../utils/dateTime');
const { sendButtonMessage, sendListMessage } = require('../mensajesWhatsapp');

const appointmentLabel = (appointment) => `${appointment.serviceName || 'Cita'} · ${formatHumanDateTime(appointment.startAt)}`;

const sendAppointmentSelection = async (phoneNumber, appointments) => sendListMessage(phoneNumber, {
    body: 'Claro. Estas son tus citas proximas. Elige cual deseas gestionar:',
    button: 'Ver mis citas',
    sectionTitle: 'Citas proximas',
    rows: appointments.map((appointment) => ({
        id: `appt_manage_select_${appointment.id}`,
        title: String(appointment.serviceName || 'Cita').slice(0, 24),
        description: formatHumanDateTime(appointment.startAt).slice(0, 72)
    }))
});

const sendActionMenu = async (phoneNumber, appointment) => sendButtonMessage(phoneNumber, [
    `Elegiste: ${appointmentLabel(appointment)}.`,
    '',
    'Que deseas hacer?'
].join('\n'), [
    { id: `appt_manage_confirm_${appointment.id}`, title: 'Confirmar' },
    { id: `appt_manage_reschedule_${appointment.id}`, title: 'Cambiar horario' },
    { id: `appt_manage_cancel_${appointment.id}`, title: 'Cancelar cita' }
]);

const sendCancelConfirmation = async (phoneNumber, appointment) => sendButtonMessage(phoneNumber,
    `Confirmas que deseas cancelar tu cita de ${appointmentLabel(appointment)}?`, [
        { id: `appt_manage_cancel_yes_${appointment.id}`, title: 'Si, cancelar' },
        { id: `appt_manage_keep_${appointment.id}`, title: 'Conservar cita' }
    ]
);

const sendRescheduleConfirmation = async (phoneNumber, appointment, startAt) => sendButtonMessage(phoneNumber, [
    'Confirma el cambio de horario:',
    '',
    `${appointment.serviceName || 'Cita'}`,
    formatHumanDateTime(startAt),
    `${Number(appointment.people || 1)} ${Number(appointment.people || 1) === 1 ? 'persona' : 'personas'}`
].join('\n'), [
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
