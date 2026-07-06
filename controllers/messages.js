const messageDebouncer = require('../utils/messageDebouncer');
const { parseIncomingMessage } = require('../utils/whatsappWebhookParser');
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const apiVerification = async (req, res) => {
    try {
        console.log('query',req.query)
        const {
            'hub.mode': mode,
            'hub.verify_token': token,
            'hub.challenge': challenge
        } = req.query
        if(mode && token && mode === 'subscribe' && token === VERIFY_TOKEN){
            return res.status(200).send(challenge);
        } else {
            return res.status(403).send('unauthorized');
        }
    } catch (error) {
        return req.status(500).send(error)
    }
}

const messageInfo = async (req, res) => {
    try {
        console.log('body', JSON.stringify(req.body.entry));
        const incoming = parseIncomingMessage(req.body);
        if(!incoming) return res.status(200).send();
        if(incoming.unsupportedType) return res.status(200).send('Type not supported');

        console.log('messageInfo', {
            from: incoming.rawPhoneNumber,
            waId: incoming.waId,
            to: incoming.phoneNumber,
            type: incoming.type,
            messageText: incoming.messageText
        });

        await messageDebouncer.handleIncoming({
            phoneNumber: incoming.phoneNumber,
            name: incoming.name,
            type: incoming.type,
            messageText: incoming.messageText,
            messageId: incoming.messageId
        });

        return res.status(200).send()
    } catch (error) {
        console.log('Error procesando webhook', error);
        if(
            error?.code === 'CHAT_PERSISTENCE_FAILED' ||
            error?.code === 'CHAT_PERSISTENCE_UNAVAILABLE'
        ) {
            return res.status(500).json({
                error: 'No se pudo guardar el mensaje en Supabase'
            });
        }

        return res.status(200).send();
    }
}

module.exports = {
    apiVerification,
    messageInfo
}
