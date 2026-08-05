const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const StateStore = require('./stateStore');
const Whatsapp = require('../config/whatsapp');
const WhatsappMedia = require('./whatsappMedia');
const ChatStore = require('./chatStore');
const CustomerProfile = require('./customerProfile');
const CampaignFunnel = require('./campaigns/funnelService');
const ResponseGuard = require('../utils/responseGuard');

const getGraphErrorMessage = (error) => {
    const graphError = error?.response?.data?.error;
    if(graphError) {
        return [
            graphError.message,
            graphError.code ? `code ${graphError.code}` : '',
            graphError.error_subcode ? `subcode ${graphError.error_subcode}` : ''
        ].filter(Boolean).join(' | ');
    }
    return error?.message || 'No se pudo enviar el mensaje';
}

const sendTextMessage = async (text, phoneNumber, options = {}) => {
    return sendMessage({
        text,
        phoneNumber,
        type: 'text',
        source: options.source,
        personalize: options.personalize,
        hasUrl: options.hasUrl
    });
}





const IMAGE_MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
};

const getImageUpload = async (source) => {
    const value = String(source || '').trim();
    if(/^https?:\/\//i.test(value)) {
        const response = await axios.get(value, {
            responseType: 'arraybuffer',
            maxContentLength: 16 * 1024 * 1024,
            maxBodyLength: 16 * 1024 * 1024
        });
        const urlPath = new URL(value).pathname;
        return {
            buffer: Buffer.from(response.data),
            filename: path.basename(urlPath) || 'service-image.jpg',
            mimeType: String(response.headers?.['content-type'] || IMAGE_MIME_TYPES[path.extname(urlPath).toLowerCase()] || 'image/jpeg').split(';')[0]
        };
    }

    const mediaRoot = path.resolve(__dirname, '..', 'mediaFiles');
    const filePath = path.resolve(mediaRoot, value.replace(/^\/?mediaFiles\//i, ''));
    if(!filePath.startsWith(`${mediaRoot}${path.sep}`)) throw new Error('Ruta de imagen no permitida.');
    return {
        buffer: await fs.readFile(filePath),
        filename: path.basename(filePath),
        mimeType: IMAGE_MIME_TYPES[path.extname(filePath).toLowerCase()] || 'image/jpeg'
    };
}

const sendLocalMedia = async (filename, phoneNumber, options = {}) => {
    const media = await getImageUpload(filename);
    const mediaId = await WhatsappMedia.uploadMedia(media);

    return sendMessage({
        text: options.caption || '',
        phoneNumber,
        type: 'image',
        mediaId,
        source: options.source
    });
}

const useTool = async (phoneNumber, tool) => {
    const activeToolKey = `${phoneNumber}:tool`;
    const stepsKey = `${phoneNumber}:steps`;
    await StateStore.set(activeToolKey, tool, 86400);
    await StateStore.del(stepsKey);
    return null
}

const personalizeInteractivePayload = async (payload, phoneNumber, shouldPersonalize) => {
    if(!payload || !shouldPersonalize) return payload;
    const clonedPayload = JSON.parse(JSON.stringify(payload));

    if(clonedPayload.body?.text) {
        clonedPayload.body.text = await CustomerProfile.personalizeText(phoneNumber, clonedPayload.body.text);
    }
    if(clonedPayload.header?.text) {
        clonedPayload.header.text = await CustomerProfile.personalizeText(phoneNumber, clonedPayload.header.text);
    }

    return clonedPayload;
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
        buttonPayload,
        mediaId,
        voice = false,
        source = 'bot'
    } = options;
    try {
        const canSend = await ResponseGuard.shouldSend({ phoneNumber });
        if(!canSend) {
            console.log('Respuesta obsoleta descartada', {
                phoneNumber,
                type,
                source
            });
            return null;
        }

        const url = Whatsapp.getMessagesUrl();
        const shouldPersonalize = source !== 'human' && options.personalize !== false;
        const outboundText = shouldPersonalize
            ? await CustomerProfile.personalizeText(phoneNumber, text)
            : text;
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
                    body: outboundText
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
                body.image = mediaId ? { id: mediaId } : { link: outboundText };
                break;
            case 'audio':
                body.type = 'audio';
                body.audio = mediaId
                    ? { id: mediaId, ...(voice ? { voice: true } : {}) }
                    : { link: outboundText };
                break;
            case 'document':
                body.type = 'document';
                body.document = document;
                document.caption = text;
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
                body.interactive = await personalizeInteractivePayload(listPayload, phoneNumber, shouldPersonalize);
                break;
            case 'button':
                body.type = 'interactive';
                body.interactive = await personalizeInteractivePayload(buttonPayload, phoneNumber, shouldPersonalize);
                break;

            case 'chatgpt':
                await useTool(phoneNumber, 'chatgpt');
                body.type = 'text';
                body.text = {
                    body: outboundText
                }
                break;
            case 'gemini':
                await useTool(phoneNumber, 'gemini');
                body.type = 'text';
                body.text = {
                    body: outboundText
                }
                break;

            default:
                break;
        }
        const config = { headers: Whatsapp.getHeaders() };
        const result = await axios.post(url, body, config);
        console.log('result',result.data);
        if(source !== 'nudge') {
            try {
                await require('./conversationNudgeService').schedule({
                    phoneNumber,
                    text: outboundText,
                    type,
                    buttonPayload: body.interactive,
                    listPayload: body.interactive,
                    source
                });
            } catch (error) {
                console.log('No se pudo programar seguimiento conversacional:', error.message);
            }
        }
        await ChatStore.addMessage({
            phoneNumber,
            direction: 'out',
            type: body.type,
            text: getDashboardMessageText(body, outboundText),
            messageId: result.data?.messages?.[0]?.id,
            source
        });
        CampaignFunnel.markContacted(phoneNumber).catch((error) => {
            console.log('No se pudo registrar contacto de campana:', error.message);
        });
        return result
    } catch (error) {
        console.log('error', error?.response?.data);
        throw new Error(getGraphErrorMessage(error))
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
    if(body.type === 'document') return body.document?.link || body.document?.filename || 'Documento';
    return fallbackText || body.type || 'Mensaje';
}

module.exports = {
    sendTextMessage,

    sendMessage,
    sendLocalMedia
}
