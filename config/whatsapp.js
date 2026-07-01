const API_VERSION = process.env.API_VERSION || 'v20.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.BOT_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN || process.env.TOKEN;

const assertWhatsappConfig = () => {
    const missing = [];
    if(!PHONE_NUMBER_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    if(!ACCESS_TOKEN) missing.push('WHATSAPP_TOKEN');

    if(missing.length){
        throw new Error(`Faltan variables de WhatsApp Business: ${missing.join(', ')}`);
    }
}

const getMessagesUrl = () => {
    assertWhatsappConfig();
    return `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
}

const getMediaUrl = () => {
    assertWhatsappConfig();
    return `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/media`;
}

const getHeaders = () => {
    assertWhatsappConfig();
    return {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    }
}

module.exports = {
    API_VERSION,
    PHONE_NUMBER_ID,
    ACCESS_TOKEN,
    getMessagesUrl,
    getMediaUrl,
    getHeaders
}
