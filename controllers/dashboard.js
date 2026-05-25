const ChatStore = require('../models/chatStore');
const Messages = require('../models/messages');

const getConversations = (req, res) => {
    res.json(ChatStore.getConversations());
}

const getMessages = (req, res) => {
    res.json(ChatStore.getMessages(req.params.phoneNumber));
}

const stream = (req, res) => {
    ChatStore.stream(req, res);
}

const sendMessage = async (req, res) => {
    const { phoneNumber } = req.params;
    const { text } = req.body || {};

    if(!text || !String(text).trim()) {
        return res.status(400).json({ error: 'Mensaje requerido' });
    }

    try {
        await Messages.sendTextMessage(String(text).trim(), phoneNumber, { source: 'human' });
        return res.json({ ok: true });
    } catch (error) {
        console.log('Error enviando desde dashboard', error);
        const message = error.message || 'No se pudo enviar el mensaje';
        const isAuthError = /authentication error|access token|oauth|session has expired|validating access token|code 190/i.test(message);
        if(isAuthError) {
            return res.status(401).json({
                error: 'El token de WhatsApp expiró. Actualiza WHATSAPP_TOKEN en .env y reinicia el servidor.',
                detail: message
            });
        }
        return res.status(500).json({ error: message });
    }
}

module.exports = {
    getConversations,
    getMessages,
    stream,
    sendMessage
}
