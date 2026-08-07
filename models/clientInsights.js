const ClientesStorage = require('./clientes/almacenamiento');
const CitasStorage = require('./citas/almacenamiento');
const ChatStore = require('./chatStore');
const ServicesRepository = require('./servicesRepository');

const DEFAULT_RESPONSIBLE = 'Asignar un empleado';

const normalizePhoneNumber = (phoneNumber) => {
    let clean = String(phoneNumber || '')
        .replace(/@c\.us$/i, '')
        .replace(/\D/g, '');
    if (clean.startsWith('521') && clean.length === 13) {
        clean = '52' + clean.slice(3);
    }
    return clean;
};

const parseDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const isConfirmed = (appointment) => String(appointment?.status || '').toLowerCase() === 'confirmada';

const getAppointmentStart = (appointment) => parseDate(appointment?.startAt);

const sortAppointmentsDesc = (appointments) => [...appointments]
    .sort((left, right) => (
        (getAppointmentStart(right)?.getTime() || 0) - (getAppointmentStart(left)?.getTime() || 0)
    ));

const getServicePrice = async (appointment) => {
    if(appointment?.price !== null && appointment?.price !== undefined && !Number.isNaN(Number(appointment.price))) {
        return Number(appointment.price);
    }

    const service = appointment?.serviceId
        ? await ServicesRepository.getServiceById(appointment.serviceId)
        : await ServicesRepository.findServiceByName(appointment?.serviceName || '');

    if(!service) return 0;

    const people = Number(appointment.people || 1);
    const peoplePrice = (service.preciosPersonas || [])
        .find((item) => Number(item.personas) === people && !Number.isNaN(Number(item.precio)));

    if(peoplePrice) return Number(peoplePrice.precio);
    return Number(service.precio || 0);
};

const getCustomerAppointmentsByPhone = async (phoneNumber) => {
    const variants = Array.from(new Set([
        phoneNumber,
        normalizePhoneNumber(phoneNumber)
    ].filter(Boolean)));

    const appointments = [];
    const seen = new Set();

    for(const variant of variants) {
        const customerAppointments = await CitasStorage.getCustomerAppointments(variant) || [];
        customerAppointments.forEach((appointment) => {
            const key = appointment.id || `${appointment.phoneNumber}:${appointment.startAt}:${appointment.serviceName}`;
            if(key && !seen.has(key)) {
                seen.add(key);
                appointments.push(appointment);
            }
        });
    }

    return sortAppointmentsDesc(appointments);
};

const getAppointmentValue = async (appointment) => ({
    ...appointment,
    estimatedAmount: await getServicePrice(appointment)
});

const buildClientInsight = async ({ client, conversation }) => {
    const phoneNumber = client?.phoneNumber || conversation?.phoneNumber;
    const appointments = await getCustomerAppointmentsByPhone(phoneNumber);
    const confirmedAppointments = sortAppointmentsDesc(appointments.filter(isConfirmed));
    const now = new Date();
    const pastConfirmed = confirmedAppointments.filter((appointment) => {
        const start = getAppointmentStart(appointment);
        return start && start <= now;
    });

    const valuedConfirmed = await Promise.all(confirmedAppointments.map(getAppointmentValue));
    const totalSpent = valuedConfirmed.reduce((sum, appointment) => sum + Number(appointment.estimatedAmount || 0), 0);
    const lastAppointment = appointments[0] || null;
    const lastVisit = pastConfirmed[0] || confirmedAppointments[0] || null;

    return {
        phoneNumber,
        name: client?.name || conversation?.name || 'Cliente nuevo',
        email: client?.email || null,
        birthday: client?.birthday || null,
        notes: client?.notes || null,
        campaignId: client?.campaignId || null,
        responsible: client?.responsible || DEFAULT_RESPONSIBLE,
        createdAt: client?.createdAt || null,
        updatedAt: client?.updatedAt || null,
        lastMessage: conversation?.lastMessage || null,
        lastContactAt: conversation?.lastAt || null,
        lastAppointment,
        lastVisit,
        appointments: appointments.slice(0, 50),
        confirmedAppointments: confirmedAppointments.slice(0, 12),
        confirmedAppointmentsCount: confirmedAppointments.length,
        totalSpent,
        appointmentsCount: appointments.length
    };
};

const getClientInsights = async () => {
    const [clients, conversations] = await Promise.all([
        ClientesStorage.listClients(),
        ChatStore.getConversationsAsync()
    ]);

    const conversationsByPhone = new Map(
        (conversations || []).map((conversation) => [normalizePhoneNumber(conversation.phoneNumber), conversation])
    );
    const clientsByPhone = new Map(
        (clients || []).map((client) => [normalizePhoneNumber(client.phoneNumber), client])
    );
    const phones = new Set([
        ...clientsByPhone.keys(),
        ...conversationsByPhone.keys()
    ]);

    const items = await Promise.all([...phones].map((phone) => buildClientInsight({
        client: clientsByPhone.get(phone),
        conversation: conversationsByPhone.get(phone)
    })));

    items.sort((left, right) => (
        new Date(right.lastContactAt || right.lastVisit?.startAt || right.updatedAt || 0)
            - new Date(left.lastContactAt || left.lastVisit?.startAt || left.updatedAt || 0)
    ));

    return {
        items,
        summary: {
            totalClients: items.length,
            assignedClients: items.filter((client) => client.responsible && client.responsible !== DEFAULT_RESPONSIBLE).length,
            confirmedAppointments: items.reduce((sum, client) => sum + client.confirmedAppointmentsCount, 0),
            totalSpent: items.reduce((sum, client) => sum + Number(client.totalSpent || 0), 0)
        }
    };
};

module.exports = {
    getClientInsights,
    DEFAULT_RESPONSIBLE
};
