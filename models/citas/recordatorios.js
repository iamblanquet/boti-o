const Messages = require('../messages');
const {
    listActiveAppointments,
    listAppointmentsNeedingCalendarSync,
    saveAppointment
} = require('./almacenamiento');
const { formatHumanDateTime } = require('../../utils/dateTime');

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 1000;
const ACTIVE_STATUSES = new Set(['pendiente', 'confirmada']);

let timer = null;
let running = false;

const getIntervalMs = () => {
    const configured = Number(process.env.APPOINTMENT_REMINDER_INTERVAL_MS);
    return Number.isFinite(configured) && configured >= 10000 ? configured : DEFAULT_INTERVAL_MS;
}

const getReminderFlags = (appointment) => appointment.reminders || {};

const isActiveAppointment = (appointment) => {
    if(!appointment?.phoneNumber || !appointment?.startAt) return false;
    if(!ACTIVE_STATUSES.has(appointment.status)) return false;
    const startAt = new Date(appointment.startAt);
    return !Number.isNaN(startAt.getTime()) && startAt > new Date();
}

const getPeopleText = (appointment) => {
    const people = Number(appointment.people || 1);
    return `${people} ${people === 1 ? 'persona' : 'personas'}`;
}

const sendConfirmationReminder = async (appointment) => {
    const text = [
        `Hola, te escribimos para confirmar tu cita de ${appointment.serviceName} para ${formatHumanDateTime(appointment.startAt)}.`,
        `La tenemos apartada para ${getPeopleText(appointment)}.`,
        '',
        'Por favor confirma tu asistencia o cancela para liberar ese espacio.'
    ].join('\n');

    await Messages.sendMessage({
        phoneNumber: appointment.phoneNumber,
        type: 'button',
        source: 'bot',
        personalize: false,
        buttonPayload: {
            type: 'button',
            body: { text },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: `appt_confirm_${appointment.id}`,
                            title: 'Confirmo'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: `appt_cancel_${appointment.id}`,
                            title: 'Cancelar'
                        }
                    }
                ]
            }
        }
    });
}

const sendOneHourReminder = async (appointment) => {
    const statusText = appointment.status === 'pendiente'
        ? 'La cita sigue pendiente de confirmacion.'
        : 'Tu cita esta confirmada.';

    const text = [
        `Te recordamos tu cita de ${appointment.serviceName} para ${formatHumanDateTime(appointment.startAt)}.`,
        `Reservacion para ${getPeopleText(appointment)}. ${statusText}`,
        'Te esperamos con mucho gusto.'
    ].join('\n');

    await Messages.sendTextMessage(text, appointment.phoneNumber, {
        source: 'bot',
        personalize: false
    });
}

const markReminderSent = async (appointment, reminderKey, sentAt = new Date()) => {
    await saveAppointment({
        ...appointment,
        reminders: {
            ...getReminderFlags(appointment),
            [reminderKey]: sentAt.toISOString()
        }
    });
}

const shouldSendConfirmationReminder = (appointment, msUntilStart) => {
    const reminders = getReminderFlags(appointment);
    return appointment.status === 'pendiente'
        && !reminders.confirmation2hSentAt
        && msUntilStart <= TWO_HOURS_MS
        && msUntilStart > ONE_HOUR_MS;
}

const shouldSendOneHourReminder = (appointment, msUntilStart) => {
    const reminders = getReminderFlags(appointment);
    return !reminders.reminder1hSentAt
        && msUntilStart <= ONE_HOUR_MS
        && msUntilStart > 0;
}

const shouldExpirePendingAppointment = (appointment, msUntilStart) => appointment.status === 'pendiente'
    && msUntilStart <= ONE_HOUR_MS
    && msUntilStart > 0;

const expirePendingAppointment = async (appointment) => {
    const { cancelAppointmentEvent } = require('../googleCalendar');
    let calendarSyncStatus = 'not-required';
    if(appointment.eventId) {
        try {
            await cancelAppointmentEvent(appointment.eventId);
            calendarSyncStatus = 'synced';
        } catch (error) {
            calendarSyncStatus = 'pending-delete';
            console.error(`No se pudo eliminar evento de cita expirada ${appointment.id}:`, error.message);
        }
    }
    await saveAppointment({
        ...appointment,
        status: 'expirada',
        expiredAt: new Date().toISOString(),
        calendarSyncStatus
    });
    await Messages.sendTextMessage(
        `Como no recibimos tu confirmacion, liberamos el horario de tu cita para ${formatHumanDateTime(appointment.startAt)}. Cuando gustes, te ayudo a agendar otro.`,
        appointment.phoneNumber,
        { source: 'bot', personalize: false }
    );
};

const retryCalendarDeletions = async () => {
    const { cancelAppointmentEvent } = require('../googleCalendar');
    const appointments = await listAppointmentsNeedingCalendarSync();
    for(const appointment of appointments) {
        if(!appointment.eventId) continue;
        try {
            await cancelAppointmentEvent(appointment.eventId);
            await saveAppointment({ ...appointment, calendarSyncStatus: 'synced' });
        } catch (error) {
            console.error(`No se pudo reintentar Calendar para cita ${appointment.id}:`, error.message);
        }
    }
};

const checkAppointmentReminders = async (now = new Date()) => {
    if(running) return;
    running = true;

    try {
        await retryCalendarDeletions();
        const appointments = await listActiveAppointments();

        for(const appointment of appointments) {
            if(!isActiveAppointment(appointment)) continue;

            const startAt = new Date(appointment.startAt);
            const msUntilStart = startAt.getTime() - now.getTime();

            try {
                if(shouldExpirePendingAppointment(appointment, msUntilStart)) {
                    await expirePendingAppointment(appointment);
                    continue;
                }

                if(shouldSendConfirmationReminder(appointment, msUntilStart)) {
                    await sendConfirmationReminder(appointment);
                    await markReminderSent(appointment, 'confirmation2hSentAt', now);
                    continue;
                }

                if(shouldSendOneHourReminder(appointment, msUntilStart)) {
                    await sendOneHourReminder(appointment);
                    await markReminderSent(appointment, 'reminder1hSentAt', now);
                }
            } catch (error) {
                console.error(`No se pudo enviar recordatorio de cita ${appointment.id}:`, error.message);
            }
        }
    } finally {
        running = false;
    }
}

const startAppointmentReminders = () => {
    if(timer) return timer;

    const intervalMs = getIntervalMs();
    checkAppointmentReminders().catch((error) => {
        console.error('No se pudo revisar recordatorios de citas:', error.message);
    });

    timer = setInterval(() => {
        checkAppointmentReminders().catch((error) => {
            console.error('No se pudo revisar recordatorios de citas:', error.message);
        });
    }, intervalMs);

    console.log(`Recordatorios de citas activos cada ${intervalMs}ms`);
    return timer;
}

module.exports = {
    startAppointmentReminders,
    checkAppointmentReminders,
    shouldExpirePendingAppointment
}
