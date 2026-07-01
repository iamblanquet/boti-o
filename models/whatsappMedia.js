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

    const response = await axios.post(Whatsapp.getMediaUrl(), form, {
        headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${Whatsapp.ACCESS_TOKEN}`
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });

    const mediaId = response.data?.id;
    if (!mediaId) {
        throw new Error('WhatsApp no devolvio un id de media.');
    }

    return mediaId;
};

module.exports = {
    uploadMedia
};
