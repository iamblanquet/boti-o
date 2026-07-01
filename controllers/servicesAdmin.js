const CatalogStore = require('../models/serviceCatalogStore');
const fs = require('fs');
const path = require('path');
const { normalizeText } = require('../utils/configCitas');

const SERVICE_MEDIA_DIR = path.join(__dirname, '..', 'mediaFiles', 'services');
const IMAGE_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png'
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

const uploadServiceImage = (req, res) => {
    try {
        const { fileName, dataUrl } = req.body || {};
        const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
        if(!match) {
            return res.status(400).json({ error: 'Imagen invalida. Usa JPG o PNG.' });
        }

        const mimeType = match[1];
        const extension = IMAGE_TYPES[mimeType];
        const buffer = Buffer.from(match[2], 'base64');
        const maxSize = 6 * 1024 * 1024;
        if(buffer.length > maxSize) {
            return res.status(400).json({ error: 'La imagen supera 6 MB.' });
        }

        const baseName = normalizeText(path.parse(String(fileName || 'servicio')).name)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'servicio';
        const filename = `${baseName}-${Date.now()}.${extension}`;
        const relativePath = `services/${filename}`;

        fs.mkdirSync(SERVICE_MEDIA_DIR, { recursive: true });
        fs.writeFileSync(path.join(SERVICE_MEDIA_DIR, filename), buffer);

        return res.status(201).json({
            file: relativePath,
            url: `/mediaFiles/${relativePath}`
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
