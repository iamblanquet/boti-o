const CatalogStore = require('../models/serviceCatalogStore');
const { randomUUID } = require('crypto');
const getSupabase = require('../config/supabase');

const SERVICE_IMAGE_BUCKET = 'service-images';
const IMAGE_TYPES = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
};

const sendError = (res, error) => {
    console.log('Error administrando servicios', error);
    const status = error.status || 500;
    const fallbackMessage = status === 503
        ? 'No se pudo conectar con Supabase para administrar el catalogo.'
        : 'No se pudo procesar la solicitud';

    return res.status(status).json({
        error: error.message || fallbackMessage
    });
}

const listServices = async (req, res) => {
    try {
        return res.json(await CatalogStore.readEditableCatalog());
    } catch (error) {
        return sendError(res, error);
    }
}

const createService = async (req, res) => {
    try {
        return res.status(201).json(await CatalogStore.createService(req.body || {}));
    } catch (error) {
        return sendError(res, error);
    }
}

const updateService = async (req, res) => {
    try {
        return res.json(await CatalogStore.updateService(req.params.id, req.body || {}));
    } catch (error) {
        return sendError(res, error);
    }
}

const deleteService = async (req, res) => {
    try {
        return res.json(await CatalogStore.deleteService(req.params.id));
    } catch (error) {
        return sendError(res, error);
    }
}

const createCategory = async (req, res) => {
    try {
        return res.status(201).json(await CatalogStore.createCategory(req.body || {}));
    } catch (error) {
        return sendError(res, error);
    }
}

const updateCategory = async (req, res) => {
    try {
        return res.json(await CatalogStore.updateCategory(req.params.id, req.body || {}));
    } catch (error) {
        return sendError(res, error);
    }
}

const deleteCategory = async (req, res) => {
    try {
        return res.json(await CatalogStore.deleteCategory(req.params.id));
    } catch (error) {
        return sendError(res, error);
    }
}

const uploadServiceImage = async (req, res) => {
    try {
        const { dataUrl } = req.body || {};
        const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
        if(!match) {
            return res.status(400).json({ error: 'Imagen invalida. Usa JPG, PNG o WEBP.' });
        }

        const mimeType = match[1];
        const extension = IMAGE_TYPES[mimeType];
        const buffer = Buffer.from(match[2], 'base64');
        const maxSize = 16 * 1024 * 1024;
        if(buffer.length > maxSize) {
            return res.status(400).json({ error: 'La imagen supera 16 MB.' });
        }

        const supabase = getSupabase();
        if(!supabase) {
            const error = new Error('Supabase no esta configurado para almacenar imagenes.');
            error.status = 503;
            throw error;
        }

        const objectPath = `services/${randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
            .from(SERVICE_IMAGE_BUCKET)
            .upload(objectPath, buffer, {
                contentType: mimeType,
                cacheControl: '31536000',
                upsert: false
            });
        if(uploadError) throw uploadError;

        const { data } = supabase.storage
            .from(SERVICE_IMAGE_BUCKET)
            .getPublicUrl(objectPath);
        if(!data?.publicUrl) throw new Error('No se pudo obtener la URL publica de la imagen.');

        return res.status(201).json({
            file: objectPath,
            url: data.publicUrl
        });
    } catch (error) {
        return sendError(res, error);
    }
}

module.exports = {
    listServices,
    createService,
    updateService,
    deleteService,
    createCategory,
    updateCategory,
    deleteCategory,
    uploadServiceImage
};
