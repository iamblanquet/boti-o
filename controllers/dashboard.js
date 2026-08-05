const ChatStore = require('../models/chatStore');
const Messages = require('../models/messages');
const ChatSummaryService = require('../models/chatSummaryService');
const AiReplySuggestionService = require('../models/aiReplySuggestionService');
const ConversationControlStore = require('../models/conversationControlStore');
const AssistedAppointmentFlow = require('../models/assistedAppointmentFlow');
const CitasStorage = require('../models/citas/almacenamiento');
const ClientesStorage = require('../models/clientes/almacenamiento');
const ClientInsights = require('../models/clientInsights');
const {
    MAX_DASHBOARD_UPLOAD_BYTES,
    parseDataUrl,
    buildSafeUploadFilename,
    resolveDashboardMessageType
} = require('../utils/dashboardFileUpload');
const { normalizeDashboardAudioUpload, transcodeAudioToMp3 } = require('../utils/dashboardAudioTranscoder');
const WhatsappMedia = require('../models/whatsappMedia');
const { uploadPublicMedia } = require('../utils/supabasePublicMedia');
const fs = require('fs');
const path = require('path');

const normalizePhoneNumber = (phoneNumber) => {
    let clean = String(phoneNumber || '')
        .replace(/@c\.us$/i, '')
        .replace(/\D/g, '');
    if (clean.startsWith('521') && clean.length === 13) {
        clean = '52' + clean.slice(3);
    }
    return clean;
};

const buildAppointmentSummary = (appointments = []) => {
    const now = new Date();
    const sorted = [...appointments].sort((a, b) => new Date(a.startAt || 0) - new Date(b.startAt || 0));
    const futureActive = sorted.filter((appointment) => {
        const endAt = appointment.endAt ? new Date(appointment.endAt) : new Date(appointment.startAt || 0);
        return endAt >= now && ['pendiente', 'confirmada'].includes(appointment.status);
    });
    const confirmed = futureActive.find((appointment) => appointment.status === 'confirmada');
    const pending = futureActive.find((appointment) => appointment.status === 'pendiente');
    const next = confirmed || pending || futureActive[0] || null;
    const latest = [...appointments].sort((a, b) => new Date(b.startAt || 0) - new Date(a.startAt || 0))[0] || null;

    return {
        totalCount: appointments.length,
        hasHistory: appointments.length > 0,
        activeStatus: next?.status || null,
        nextStartAt: next?.startAt || null,
        latestStatus: latest?.status || null,
        latestStartAt: latest?.startAt || null
    };
};

const applyConversationMetadata = (conversations, clients, appointmentsByPhone) => {
    const clientsByPhone = new Map(
        (clients || [])
            .filter((client) => client?.phoneNumber)
            .map((client) => [normalizePhoneNumber(client.phoneNumber), client])
    );

    return (conversations || []).map((conversation) => {
        const client = clientsByPhone.get(normalizePhoneNumber(conversation.phoneNumber));
        return {
            ...conversation,
            name: client?.name || conversation.name,
            responsible: client?.responsible || null,
            appointmentSummary: buildAppointmentSummary(
                appointmentsByPhone.get(normalizePhoneNumber(conversation.phoneNumber)) || []
            )
        };
    });
};

const getConversations = async (req, res) => {
    try {
        const [conversations, clients] = await Promise.all([
            ChatStore.getConversationsAsync(),
            ClientesStorage.listClients()
        ]);
        const appointmentsByPhone = await CitasStorage.getCustomerAppointmentsByPhoneNumbers(
            conversations.map((conversation) => conversation.phoneNumber)
        );
        res.json(applyConversationMetadata(conversations, clients, appointmentsByPhone));
    } catch (error) {
        console.log('Error obteniendo conversaciones', error);
        res.status(500).json({ error: 'No se pudieron obtener las conversaciones' });
    }
}

const getMessages = async (req, res) => {
    try {
        res.json(await ChatStore.getMessagesAsync(req.params.phoneNumber));
    } catch (error) {
        console.log('Error obteniendo mensajes', error);
        res.status(500).json({ error: 'No se pudieron obtener los mensajes' });
    }
}

const getChatSummary = async (req, res) => {
    try {
        res.json({ summary: await ChatSummaryService.getSummary(req.params.phoneNumber) });
    } catch (error) {
        console.log('Error obteniendo resumen IA', error);
        res.status(500).json({ error: 'No se pudo obtener el resumen IA' });
    }
}

const regenerateChatSummary = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const messages = await ChatStore.getMessagesAsync(phoneNumber);
        const summary = await ChatSummaryService.generateSummary(phoneNumber, messages, { force: true });
        res.json({ ok: true, summary });
    } catch (error) {
        console.log('Error regenerando resumen IA', error);
        res.status(500).json({ error: 'No se pudo regenerar el resumen IA' });
    }
}

const generateReplySuggestion = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const { draft } = req.body || {};
        const messages = await ChatStore.getMessagesAsync(phoneNumber);
        const suggestion = await AiReplySuggestionService.generateReplySuggestion(phoneNumber, messages, { draft });
        res.json({ ok: true, ...suggestion });
    } catch (error) {
        console.log('Error generando sugerencia IA', error);
        res.status(error.status || 500).json({ error: error.message || 'No se pudo generar la sugerencia IA' });
    }
}

const getConversationControl = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        res.json({ control: await ConversationControlStore.getControl(phoneNumber) });
    } catch (error) {
        console.log('Error obteniendo control de conversacion', error);
        res.status(500).json({ error: 'No se pudo obtener el control de la conversacion' });
    }
}

const takeConversationControl = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const { takenBy, reason } = req.body || {};
        const control = await ConversationControlStore.takeControl(phoneNumber, { takenBy, reason });
        ChatStore.clearAlert(phoneNumber, 'ai_unavailable');
        ChatStore.setAlert(phoneNumber, {
            type: 'human_control',
            severity: 'info',
            title: 'Control humano activo',
            message: 'El bot esta pausado. Responde desde el dashboard.'
        });
        ChatStore.broadcastControl(phoneNumber, control);
        res.json({ ok: true, control });
    } catch (error) {
        console.log('Error tomando control de conversacion', error);
        res.status(500).json({ error: 'No se pudo tomar control de la conversacion' });
    }
}

const releaseConversationControl = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const control = await ConversationControlStore.releaseControl(phoneNumber);
        ChatStore.clearAlert(phoneNumber, 'human_control');
        ChatStore.broadcastControl(phoneNumber, control);
        res.json({ ok: true, control });
    } catch (error) {
        console.log('Error devolviendo control al bot', error);
        res.status(500).json({ error: 'No se pudo devolver el control al bot' });
    }
}

const startAppointmentFlowFromDashboard = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const { serviceId } = req.body || {};
        const result = await AssistedAppointmentFlow.startAppointmentFlow({
            phoneNumber,
            serviceId
        });
        ChatStore.clearAlert(phoneNumber, 'human_control');
        ChatStore.setAlert(phoneNumber, {
            type: 'assisted_flow',
            severity: 'info',
            title: 'Flujo de citas asistido',
            message: result.service
                ? `El bot continuara la agenda para ${result.service.name}.`
                : 'El bot solo continuara el flujo de citas iniciado desde el dashboard.'
        });
        ChatStore.broadcastControl(phoneNumber, result.control);
        res.json({ ok: true, control: result.control, service: result.service });
    } catch (error) {
        console.log('Error iniciando flujo de citas desde dashboard', error);
        res.status(error.status || 500).json({ error: error.message || 'No se pudo iniciar el flujo de citas' });
    }
}

const generateDetailedChatContext = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const messages = await ChatStore.getMessagesAsync(phoneNumber);
        const context = await ChatSummaryService.generateDetailedContext(phoneNumber, messages);
        res.json({ ok: true, context });
    } catch (error) {
        console.log('Error generando contexto detallado IA', error);
        res.status(500).json({ error: 'No se pudo generar el contexto detallado' });
    }
}

const getDetailedChatContext = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const messages = await ChatStore.getMessagesAsync(phoneNumber);
        const context = await ChatSummaryService.getDetailedContext(phoneNumber, messages);
        res.json({ ok: true, context });
    } catch (error) {
        console.log('Error obteniendo contexto detallado IA', error);
        res.status(500).json({ error: 'No se pudo obtener el contexto detallado' });
    }
}

const stream = (req, res) => {
    ChatStore.stream(req, res);
}

const sendMessage = async (req, res) => {
    const { phoneNumber } = req.params;
    const { text, file } = req.body || {};

    if ((!text || !String(text).trim()) && !file) {
        return res.status(400).json({ error: 'Mensaje o archivo requerido' });
    }

    try {
        if (file) {
            const { name, dataUrl, recorded = false, kind = null } = file;
            const parsedFile = parseDataUrl(dataUrl);
            if (!parsedFile) {
                return res.status(400).json({ error: 'Formato de archivo inválido' });
            }

            const normalizedFile = await normalizeDashboardAudioUpload({
                name,
                mimeType: parsedFile.mimeType,
                buffer: parsedFile.buffer,
                recorded,
                kind
            });
            const { mimeType, buffer, voice = false } = normalizedFile;
            const finalName = normalizedFile.name || name;

            if (buffer.length > MAX_DASHBOARD_UPLOAD_BYTES) {
                return res.status(400).json({ error: 'El archivo supera el límite de 16 MB.' });
            }

            const filename = buildSafeUploadFilename(finalName, mimeType);
            const type = resolveDashboardMessageType(mimeType, finalName);
            const imageUrl = type === 'image'
                ? await uploadPublicMedia({ folder: 'dashboard', buffer, filename, mimeType })
                : null;

            let dashboardFilename = filename;
            if (!imageUrl) {
                const uploadsDir = path.join(__dirname, '..', 'mediaFiles', 'uploads');
                fs.mkdirSync(uploadsDir, { recursive: true });
                fs.writeFileSync(path.join(uploadsDir, filename), buffer);
            }
            if (voice) {
                const previewFile = await transcodeAudioToMp3({
                    buffer,
                    name: finalName
                });
                dashboardFilename = buildSafeUploadFilename(previewFile.name, previewFile.mimeType);
                const uploadsDir = path.join(__dirname, '..', 'mediaFiles', 'uploads');
                fs.mkdirSync(uploadsDir, { recursive: true });
                fs.writeFileSync(path.join(uploadsDir, dashboardFilename), previewFile.buffer);
            }

            const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
            const fileUrl = imageUrl || `${baseUrl.replace(/\/$/, '')}/mediaFiles/uploads/${filename}`;
            const dashboardFileUrl = imageUrl || `${baseUrl.replace(/\/$/, '')}/mediaFiles/uploads/${dashboardFilename}`;
            const relativeUrl = imageUrl || `/mediaFiles/uploads/${dashboardFilename}`;
            const mediaId = type === 'audio'
                ? await WhatsappMedia.uploadMedia({
                    buffer,
                    filename,
                    mimeType
                })
                : null;

            const options = {
                phoneNumber,
                type,
                source: 'human',
                text: String(text || '').trim() || relativeUrl
            };

            if (type === 'document') {
                options.document = {
                    link: fileUrl,
                    filename: finalName || filename
                };
                options.text = String(text || '').trim() || finalName;
            } else {
                options.text = type === 'audio' ? dashboardFileUrl : fileUrl;
                if (mediaId) options.mediaId = mediaId;
                if (voice) options.voice = true;
            }

            await Messages.sendMessage(options);
        } else {
            await Messages.sendTextMessage(String(text).trim(), phoneNumber, { source: 'human' });
        }

        ChatStore.clearAlert(phoneNumber, 'ai_unavailable');
        return res.json({ ok: true });
    } catch (error) {
        console.log('Error enviando desde dashboard', error);
        const message = error.message || 'No se pudo enviar el mensaje';
        const isAuthError = /authentication error|access token|oauth|session has expired|validating access token|code 190/i.test(message);
        if (isAuthError) {
            return res.status(401).json({
                error: 'El token de WhatsApp expiró. Actualiza WHATSAPP_TOKEN en .env y reinicia el servidor.',
                detail: message
            });
        }
        return res.status(500).json({ error: message });
    }
}

const getClientAppointments = async (req, res) => {
    try {
        let phone = req.params.phoneNumber;
        let appointments = await CitasStorage.getCustomerAppointments(phone);
        
        // Si no encuentra con @c.us, intentar buscar solo con los números
        if (!appointments || appointments.length === 0) {
            let phoneClean = phone.replace('@c.us', '');
            appointments = await CitasStorage.getCustomerAppointments(phoneClean);
        }
        
        res.json(appointments || []);
    } catch (error) {
        console.log('Error obteniendo citas', error);
        res.status(500).json({ error: 'No se pudieron obtener las citas del cliente' });
    }
}

const getClients = async (req, res) => {
    try {
        const clients = await ClientesStorage.listClients();
        res.json(clients || []);
    } catch (error) {
        console.log('Error al listar clientes', error);
        res.status(500).json({ error: 'No se pudieron obtener los clientes' });
    }
}

const getClientInsights = async (req, res) => {
    try {
        res.json(await ClientInsights.getClientInsights());
    } catch (error) {
        console.log('Error al obtener vista enriquecida de clientes', error);
        res.status(500).json({ error: 'No se pudo obtener la vista enriquecida de clientes' });
    }
}

const getClientDetails = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const client = await ClientesStorage.getClient(phoneNumber);
        if (!client) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }
        res.json(client);
    } catch (error) {
        console.log('Error al obtener detalle del cliente', error);
        res.status(500).json({ error: 'No se pudo obtener el detalle del cliente' });
    }
}

const hasOwn = (object, field) => Object.prototype.hasOwnProperty.call(object || {}, field);

const isValidBirthday = (day, month) => {
    if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
    if (month < 1 || month > 12 || day < 1) return false;
    const daysByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= daysByMonth[month - 1];
};

const updateClient = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const { name, email, notes, campaignId, responsible, birthdayDay, birthdayMonth } = req.body || {};
        
        const existing = await ClientesStorage.getClient(phoneNumber) || {};
        const hasBirthdayDay = hasOwn(req.body, 'birthdayDay');
        const hasBirthdayMonth = hasOwn(req.body, 'birthdayMonth');
        let normalizedBirthdayDay = existing.birthdayDay ?? null;
        let normalizedBirthdayMonth = existing.birthdayMonth ?? null;

        if (hasBirthdayDay || hasBirthdayMonth) {
            if (!hasBirthdayDay || !hasBirthdayMonth) {
                return res.status(400).json({ error: 'El cumpleanos requiere dia y mes.' });
            }

            if (birthdayDay === null && birthdayMonth === null) {
                normalizedBirthdayDay = null;
                normalizedBirthdayMonth = null;
            } else {
                normalizedBirthdayDay = Number(birthdayDay);
                normalizedBirthdayMonth = Number(birthdayMonth);

                if (!isValidBirthday(normalizedBirthdayDay, normalizedBirthdayMonth)) {
                    return res.status(400).json({ error: 'Cumpleanos invalido. Usa solo dia y mes.' });
                }
            }
        }

        const updated = await ClientesStorage.saveClient({
            ...existing,
            phoneNumber,
            name: name !== undefined ? name : existing.name,
            email: email !== undefined ? email : existing.email,
            notes: notes !== undefined ? notes : existing.notes,
            responsible: responsible !== undefined ? responsible : existing.responsible,
            campaignId: campaignId !== undefined ? campaignId : existing.campaignId,
            birthdayDay: normalizedBirthdayDay,
            birthdayMonth: normalizedBirthdayMonth
        });
        
        if (name !== undefined) {
            ChatStore.updateConversationName(phoneNumber, name);
        }
        
        res.json({ ok: true, client: updated });
    } catch (error) {
        console.log('Error al actualizar cliente', error);
        res.status(500).json({ error: 'No se pudo actualizar el cliente' });
    }
}

const getClientConfirmedAppointments = async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const appointments = await ClientesStorage.getClientConfirmedAppointments(phoneNumber);
        res.json(appointments || []);
    } catch (error) {
        console.log('Error al obtener citas confirmadas del cliente', error);
        res.status(500).json({ error: 'No se pudieron obtener las citas confirmadas' });
    }
}

module.exports = {
    getConversations,
    getMessages,
    getChatSummary,
    regenerateChatSummary,
    generateReplySuggestion,
    getConversationControl,
    takeConversationControl,
    releaseConversationControl,
    startAppointmentFlowFromDashboard,
    getDetailedChatContext,
    generateDetailedChatContext,
    stream,
    sendMessage,
    getClientAppointments,
    getClients,
    getClientInsights,
    getClientDetails,
    updateClient,
    getClientConfirmedAppointments
}
