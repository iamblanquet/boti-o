const axios = require('axios');
const Redis = require('../config/redis');
const Whatsapp = require('../config/whatsapp');
const ChatStore = require('./chatStore');
const stepsResponses = require('../helpers/thessaResponses.json');

const sendTextMessage = async (text, phoneNumber) => {
    return sendMessage({
        text,
        phoneNumber,
        type: 'text'
    });
}

const sendReplyTextMessage = async (text, phoneNumber, messageId) => {
    try {
        const url = Whatsapp.getMessagesUrl();
        const body = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneNumber,
            context: {
                message_id: messageId
            },
            type: 'text',
            text: {
                preview_url: false,
                body: text
            }
        }
        const config = { headers: Whatsapp.getHeaders() };
        const result = await axios.post(url, body, config);
        console.log('result',result.data);
        return result 
    } catch (error) {
        console.log('error', error?.response?.data);
        throw new Error(error?.response?.data?.error?.message)
    }
    
}

const sendReactionMessage = async (phoneNumber, messageId) => {
    try {
        const url = Whatsapp.getMessagesUrl();
        const body = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneNumber,
            type: 'reaction',
            reaction: {
                message_id: messageId,
                emoji: '✅'
            }
        }
        const config = { headers: Whatsapp.getHeaders() };
        const result = await axios.post(url, body, config);
        console.log('result',result.data);
        return result 
    } catch (error) {
        console.log('error', error?.response?.data);
        throw new Error(error?.response?.data?.error?.message)
    }
}

const getPublicMediaUrl = (filename) => {
    const baseUrl = process.env.PUBLIC_BASE_URL;
    if(!baseUrl) return null;
    return `${baseUrl.replace(/\/$/, '')}/mediaFiles/${filename}`;
}

const sendLocalMedia = async (filename, phoneNumber) => {
    const url = getPublicMediaUrl(filename);
    if(!url) {
        console.log(`PUBLIC_BASE_URL no configurado. No se envio media local: ${filename}`);
        return null;
    }

    return sendMessage({
        text: url,
        phoneNumber,
        type: 'image'
    });
}

const useTool = async (phoneNumber, tool) => {
    const redis = await Redis();
    const activeToolKey = `${phoneNumber}:tool`;
    const stepsKey = `${phoneNumber}:steps`;
    await redis.set(activeToolKey, tool);
    await redis.expire(activeToolKey, 86400);
    await redis.del(stepsKey);
    return null
}

const sendMessage = async (options) => {
    const {
        text,
        phoneNumber,
        messageId,
        reply = false,
        hasUrl = false,
        type,
        document,
        contact,
        location,
        listPayload,
        buttonPayload
    } = options;
    try {
        const url = Whatsapp.getMessagesUrl();
        const body = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneNumber,
        }
        if(reply && messageId){
            body.context = {
                message_id: messageId
            }
        }
        switch (type) {
            case 'text':
                body.type = 'text';
                body.text = {
                    preview_url: hasUrl,
                    body: text
                }
                break;
            case 'reaction':
                body.type = 'reaction';
                body.reaction = {
                    message_id: messageId,
                    emoji: text //'✅'
                }
                break;
            case 'image':
                body.type = 'image';
                body.image = {
                    link: text
                }
                break;
            case 'audio':
                body.type = 'audio';
                body.audio = {
                    link: text
                }
                break;
            case 'document':
                body.type = 'document';
                body.document = document;
                document.caption = text;
                break;
            case 'sticker':
                body.type = 'sticker',
                body.sticker = {
                    id: text
                }
                break;
            case 'video':
                body.type = 'video';
                body.video = {
                    link: text
                } 
                break;
            case 'contacts':
                body.type = 'contacts';
                body.contacts = contact;
                break;
            case 'location':
                body.type = 'location';
                body.location = location;
                break;
            case 'list':
                body.type = 'interactive';
                body.interactive = listPayload;
                break;
            case 'button':
                body.type = 'interactive';
                body.interactive = buttonPayload;
                break;
            case 'dialogflow': 
                await useTool(phoneNumber, 'dialogflow');
                body.type = 'text';
                body.text = {
                    body: text
                }
                break;
            case 'chatgpt':
                await useTool(phoneNumber, 'chatgpt');
                body.type = 'text';
                body.text = {
                    body: text
                }
                break;
            case 'gemini':
                await useTool(phoneNumber, 'gemini');
                body.type = 'text';
                body.text = {
                    body: text
                }
                break;
            case 'appointment':
                body.type = 'text';
                body.text = {
                    body: text
                }
                break;
            default:
                break;
        }
        const config = { headers: Whatsapp.getHeaders() };
        const result = await axios.post(url, body, config);
        console.log('result',result.data);
        ChatStore.addMessage({
            phoneNumber,
            direction: 'out',
            type: body.type,
            text: getDashboardMessageText(body, text),
            messageId: result.data?.messages?.[0]?.id
        });
        return result
    } catch (error) {
        console.log('error', error?.response?.data);
        throw new Error(error?.response?.data?.error?.message)
    }
}

const getDashboardMessageText = (body, fallbackText) => {
    if(body.type === 'text') return body.text?.body || fallbackText || '';
    if(body.type === 'interactive') {
        const interactive = body.interactive || {};
        if(interactive.type === 'button') return interactive.body?.text || 'Menu de botones';
        if(interactive.type === 'list') return interactive.body?.text || 'Lista interactiva';
        return 'Mensaje interactivo';
    }
    if(body.type === 'image') return body.image?.link || 'Imagen';
    if(body.type === 'document') return body.document?.caption || body.document?.filename || 'Documento';
    return fallbackText || body.type || 'Mensaje';
}

const sendMessageSteps = async (message, phoneNumber, messageId) => {
    const redis = await Redis();
    
    const inactiveClientKey = `${phoneNumber}:inactive`;
    const inactiveClientRedis = await redis.get(inactiveClientKey);
    if(inactiveClientRedis) return "Client inactive"
    const stepsKey = `${phoneNumber}:steps`;
    let step = 0;
    if(message === 'menu'){
        await redis.del(stepsKey);
    } else {
        step = await redis.get(stepsKey) || 0;
    } 
    try {
        const key = stepsResponses.find(items => {
            const previousStep = items.previousStep ?? items.previusStep;
            return items.keywords.includes(message) && Number(previousStep) === Number(step);
        });
        if(!key) return false
        const {
            response,
            type,
            document,
            location,
            buttonPayload,
            listPayload,
            localFile
        } = key

        if(key.function === 'gemini') {
            await useTool(phoneNumber, 'gemini');
            await sendTextMessage(response.join(''), phoneNumber);
            return true;
        }

        if(key.function === 'appointment') {
            const Appointments = require('./appointments');
            await redis.del(stepsKey);
            if(message === 'menu_appointment') {
                await Appointments.prepareAppointmentFlow(phoneNumber);
                await sendTextMessage(response.join(''), phoneNumber);
            } else {
                await Appointments.startAppointmentFlow(phoneNumber, message);
            }
            return true;
        }

        if(localFile) {
            const files = Array.isArray(localFile) ? localFile : [localFile];
            for(const file of files) {
                await sendLocalMedia(file, phoneNumber);
            }
        }

        await redis.set(stepsKey, key.step);
        await redis.expire(stepsKey, 86400);

        const options = {
            text: response.join(''),
            type: type || 'text',
            phoneNumber,
            messageId,
            document,
            location,
            buttonPayload,
            listPayload
        }
        await sendMessage(options)
        return true
    } catch (error) {
        throw new Error(error?.response?.data?.error?.message)
    }
}

module.exports = {
    sendTextMessage,
    sendReplyTextMessage,
    sendReactionMessage,
    sendMessage,
    sendMessageSteps,
    sendLocalMedia
}
