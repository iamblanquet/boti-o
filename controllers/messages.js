const Messages = require('../models/messages');
const clientModel = require('../models/clients');
const Dialogflow = require('../models/dialogflow');
const Chatgpt = require('../models/chatgpt');
const Gemini = require('../models/gemini');
const Appointments = require('../models/appointments');
const GuidedResponses = require('../models/guidedResponses');
const ChatStore = require('../models/chatStore');
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const Redis = require('../config/redis');

const normalizeWhatsappRecipient = (phoneNumber) => {
    if(phoneNumber?.startsWith('521') && phoneNumber.length === 13){
        return `52${phoneNumber.slice(3)}`;
    }
    return phoneNumber;
}

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
        const redis = await Redis();
        console.log('body', JSON.stringify(req.body.entry));
        const body = req.body?.entry?.[0]?.changes?.[0];
        const {
            value: {
                contacts,
                messages
            } = {}
        } = body || {};
        if(!messages) return res.status(200).send();
        const {
            profile: {
                name: wsName
            } = {}
        } = contacts?.[0] || {};
        const {
            from: phoneNumber,
            id: messageId,
            type
        } = messages[0]
        const whatsappNumber = normalizeWhatsappRecipient(contacts?.[0]?.wa_id || phoneNumber);

        let messageText = ''
        switch (type) {
            case 'text':
                messageText = messages[0]?.text?.body
                break;
            case 'interactive':
                const interactiveType = messages[0]?.interactive.type;
                if(interactiveType === 'button_reply') {
                    messageText = messages[0]?.interactive?.button_reply.id || messages[0]?.interactive?.button_reply.title;
                }
                if(interactiveType === 'list_reply') {
                    messageText = messages[0]?.interactive?.list_reply.id || messages[0]?.interactive?.list_reply.title;
                }
                break
            default:
                return res.status(200).send('Type not supported')
        }
        const formatMessage = messageText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        console.log('messageInfo', {
            from: phoneNumber,
            waId: contacts?.[0]?.wa_id,
            to: whatsappNumber,
            type,
            messageText
        });

        ChatStore.addMessage({
            phoneNumber: whatsappNumber,
            name: wsName,
            direction: 'in',
            type,
            text: messageText,
            messageId
        });

        await clientModel.verifyStoreClient(whatsappNumber, wsName, messageText);

        const activeToolKey = `${whatsappNumber}:tool`;
        const conextKey = `${whatsappNumber}:context`;
        const gptContextKey = `${whatsappNumber}:chatgpt:context`;
        const geminiContextKey = `${whatsappNumber}:gemini:history`;

        let activeTool;
        if(formatMessage === 'menu'){
            await redis.del(activeToolKey);
            await redis.del(conextKey);
            await redis.del(gptContextKey);
            await redis.del(geminiContextKey);
        } else {
            activeTool = await redis.get(activeToolKey);
        } 
        console.log('activeTool',activeTool)
        const isMenuCommand = formatMessage === 'menu' || formatMessage.startsWith('menu_');
        const isServiceButton = formatMessage.startsWith('service_');
        const shouldCheckAppointmentFirst = formatMessage !== 'menu' && !isServiceButton;
        const handledByAppointment = shouldCheckAppointmentFirst
            ? await Appointments.handleAppointmentMessage(whatsappNumber, messageText)
            : false;
        const shouldUseGuidedFlow = isMenuCommand || isServiceButton || !activeTool;

        if(handledByAppointment) {
            return res.status(200).send();
        }

        if(shouldUseGuidedFlow) {
            const handledByFlow = await Messages.sendMessageSteps(formatMessage, whatsappNumber, messageId);
            if(handledByFlow) {
                return res.status(200).send();
            }
        }

        if(activeTool === 'dialogflow') {
            await Dialogflow.dialogflowProccess(messageText, whatsappNumber, messageId)
        } else if (activeTool === 'chatgpt'){
            await Chatgpt.chatgpt(messageText, whatsappNumber, messageId);
        } else if (activeTool === 'gemini'){
            await Gemini.geminiProccess(messageText, whatsappNumber);
        } else {
            const handledByGuidedResponse = await GuidedResponses.handleGuidedResponse(whatsappNumber, messageText);
            if(!handledByGuidedResponse) await Gemini.geminiProccess(messageText, whatsappNumber);
        }

        return res.status(200).send()
    } catch (error) {
        console.log('Error procesando webhook', error);
        return res.status(200).send();
    }
}

module.exports = {
    apiVerification,
    messageInfo
}
