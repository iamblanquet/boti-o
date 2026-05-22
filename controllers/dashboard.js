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
        await Messages.sendTextMessage(String(text).trim(), phoneNumber);
        return res.json({ ok: true });
    } catch (error) {
        console.log('Error enviando desde dashboard', error);
        return res.status(500).json({ error: error.message || 'No se pudo enviar el mensaje' });
    }
}

module.exports = {
    getConversations,
    getMessages,
    stream,
    sendMessage
}
