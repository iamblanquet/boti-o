const { v4: uuidv4 } = require('uuid');
const Redis = require('../config/redis');

const ACTIVE_SET_KEY = 'appointments:active';

const appointmentKey = (id) => `appointment:${id}`;
const customerAppointmentsKey = (phoneNumber) => `${phoneNumber}:appointments`;
const flowKey = (phoneNumber) => `${phoneNumber}:appointment:flow`;

const parseJson = async (key) => {
    const redis = await Redis();
    const raw = await redis.get(key);
    if(!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        await redis.del(key);
        return null;
    }
}

const getFlow = async (phoneNumber) => parseJson(flowKey(phoneNumber));

const saveFlow = async (phoneNumber, flow) => {
    const redis = await Redis();
    await redis.set(flowKey(phoneNumber), JSON.stringify(flow));
    await redis.expire(flowKey(phoneNumber), 86400);
}

const clearFlow = async (phoneNumber) => {
    const redis = await Redis();
    await redis.del(flowKey(phoneNumber));
}

const saveAppointment = async (appointment) => {
    const redis = await Redis();
    const id = appointment.id || uuidv4();
    const payload = {
        ...appointment,
        id,
        updatedAt: new Date().toISOString()
    };

    await redis.set(appointmentKey(id), JSON.stringify(payload));
    await redis.sAdd(customerAppointmentsKey(payload.phoneNumber), id);
    if(payload.status !== 'cancelada') {
        await redis.sAdd(ACTIVE_SET_KEY, id);
    } else {
        await redis.sRem(ACTIVE_SET_KEY, id);
    }

    return payload;
}

const getAppointment = async (id) => parseJson(appointmentKey(id));

const getCustomerAppointments = async (phoneNumber) => {
    const redis = await Redis();
    const ids = await redis.sMembers(customerAppointmentsKey(phoneNumber));
    const appointments = [];

    for(const id of ids) {
        const appointment = await getAppointment(id);
        if(appointment) appointments.push(appointment);
    }

    return appointments.sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
}

const getLatestActiveAppointment = async (phoneNumber) => {
    const appointments = await getCustomerAppointments(phoneNumber);
    return appointments.find((appointment) => ['pendiente', 'confirmada'].includes(appointment.status)) || null;
}

module.exports = {
    getFlow,
    saveFlow,
    clearFlow,
    saveAppointment,
    getAppointment,
    getCustomerAppointments,
    getLatestActiveAppointment
}
