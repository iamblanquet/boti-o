const ChatStore = require('../models/chatStore');
const ClientesStorage = require('../models/clientes/almacenamiento');
const CitasStorage = require('../models/citas/almacenamiento');
const PipelineStore = require('../models/patientPipeline/almacenamiento');
const { getAutomaticStage } = require('../models/patientPipeline/classifier');
const { STAGE_DEFINITIONS, getStageLabel, isValidStage } = require('../models/patientPipeline/stages');

const normalizePhoneNumber = PipelineStore.normalizePhoneNumber;

const parseDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getRelevantAppointment = (appointments = [], now = new Date()) => {
    const confirmed = appointments
        .filter((appointment) => String(appointment?.status || '').toLowerCase() === 'confirmada')
        .map((appointment) => ({
            ...appointment,
            startDate: parseDate(appointment.startAt),
            endDate: parseDate(appointment.endAt)
        }))
        .filter((appointment) => appointment.startDate && appointment.endDate);

    const current = confirmed.find((appointment) => appointment.startDate <= now && now <= appointment.endDate);
    if (current) return current;

    const future = confirmed
        .filter((appointment) => appointment.startDate > now)
        .sort((left, right) => left.startDate - right.startDate)[0];
    if (future) return future;

    return confirmed
        .filter((appointment) => appointment.endDate < now)
        .sort((left, right) => right.endDate - left.endDate)[0] || null;
};

const cleanAppointment = (appointment) => {
    if (!appointment) return null;
    return {
        id: appointment.id,
        serviceName: appointment.serviceName,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status
    };
};

const buildBoardItem = ({ conversation, client, appointments, override, now }) => {
    const automaticStage = getAutomaticStage({ conversation, appointments, now });
    const manualStage = override?.manualStage && isValidStage(override.manualStage)
        ? override.manualStage
        : null;
    const stage = manualStage || automaticStage;
    const phoneNumber = normalizePhoneNumber(conversation.phoneNumber);

    return {
        phoneNumber,
        rawPhoneNumber: conversation.phoneNumber,
        name: client?.name || conversation.name || 'Paciente nuevo',
        lastMessage: conversation.lastMessage || '',
        lastAt: conversation.lastAt || null,
        lastDirection: conversation.lastDirection || null,
        incomingCount: Number(conversation.incomingCount || 0),
        outgoingCount: Number(conversation.outgoingCount || 0),
        unread: Number(conversation.unread || 0),
        alert: conversation.alert || null,
        responsible: client?.responsible || 'Asignar un empleado',
        campaignId: client?.campaignId || null,
        automaticStage,
        automaticStageLabel: getStageLabel(automaticStage),
        manualStage,
        stage,
        stageLabel: getStageLabel(stage),
        stageSource: manualStage ? 'manual' : 'automatic',
        appointment: cleanAppointment(getRelevantAppointment(appointments, now))
    };
};

const getBoard = async (_req, res) => {
    try {
        const [conversations, clients, overrides] = await Promise.all([
            ChatStore.getConversationsAsync(),
            ClientesStorage.listClients(),
            PipelineStore.listOverrides()
        ]);

        const appointmentsByPhone = await CitasStorage.getCustomerAppointmentsByPhoneNumbers(
            conversations.map((conversation) => conversation.phoneNumber)
        );
        const clientsByPhone = new Map((clients || []).map((client) => [
            normalizePhoneNumber(client.phoneNumber),
            client
        ]));
        const now = new Date();

        const items = (conversations || []).map((conversation) => {
            const phone = normalizePhoneNumber(conversation.phoneNumber);
            return buildBoardItem({
                conversation,
                client: clientsByPhone.get(phone),
                appointments: appointmentsByPhone.get(phone) || [],
                override: overrides[phone],
                now
            });
        });

        return res.json({
            stages: STAGE_DEFINITIONS,
            items,
            generatedAt: now.toISOString()
        });
    } catch (error) {
        console.log('Error al obtener seguimiento de pacientes', error);
        return res.status(500).json({ error: 'No se pudo obtener el seguimiento de pacientes' });
    }
};

const updateManualStage = async (req, res) => {
    const { phoneNumber } = req.params;
    const { stage } = req.body || {};
    if (!isValidStage(stage)) {
        return res.status(400).json({ error: 'Etapa no valida.' });
    }

    const override = await PipelineStore.saveManualStage(phoneNumber, stage);
    return res.json({ ok: true, override });
};

const clearManualStage = async (req, res) => {
    const override = await PipelineStore.clearManualStage(req.params.phoneNumber);
    return res.json({ ok: true, override });
};

module.exports = {
    getBoard,
    updateManualStage,
    clearManualStage
};
