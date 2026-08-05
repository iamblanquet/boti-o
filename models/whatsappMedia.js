const axios = require('axios');
const FormData = require('form-data');
const Whatsapp = require('../config/whatsapp');

const uploadMedia = async ({ buffer, filename, mimeType }) => {
    if (!buffer?.length) {
        throw new Error('Archivo de media vacio.');
    }

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', buffer, {
        filename: filename || 'audio.ogg',
        contentType: mimeType || 'application/octet-stream'
    });

    let response;
    try {
        response = await axios.post(Whatsapp.getMediaUrl(), form, {
            headers: {
                ...form.getHeaders(),
                Authorization: `Bearer ${Whatsapp.ACCESS_TOKEN}`
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });
    } catch (error) {
        const graphError = error.response?.data?.error;
        const detail = [
            graphError?.message || error.message,
            graphError?.code ? `code ${graphError.code}` : '',
            graphError?.error_data?.details || ''
        ].filter(Boolean).join(' | ');
        throw new Error(`WhatsApp no aceptó la imagen ${filename || ''}: ${detail}`.trim());
    }

    const mediaId = response.data?.id;
    if (!mediaId) {
        throw new Error('WhatsApp no devolvio un id de media.');
    }

    return mediaId;
};

module.exports = {
    uploadMedia
};
