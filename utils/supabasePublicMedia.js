const { randomUUID } = require('crypto');
const path = require('path');
const getSupabase = require('../config/supabase');

// Este bucket ya se usa para las imágenes del catálogo y debe ser público.
// Las carpetas separan los medios para que no dependan del disco del servidor.
const PUBLIC_MEDIA_BUCKET = 'service-images';

const uploadPublicMedia = async ({ folder, buffer, filename, mimeType }) => {
    const supabase = getSupabase();
    if(!supabase) {
        const error = new Error('Supabase no está configurado para almacenar archivos.');
        error.status = 503;
        throw error;
    }

    const extension = path.extname(String(filename || '')).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
    const objectPath = `${String(folder || 'uploads').replace(/[^a-z0-9-]/gi, '')}/${randomUUID()}${extension}`;
    const { error: uploadError } = await supabase.storage
        .from(PUBLIC_MEDIA_BUCKET)
        .upload(objectPath, buffer, {
            contentType: mimeType || 'application/octet-stream',
            cacheControl: '31536000',
            upsert: false
        });
    if(uploadError) throw uploadError;

    const { data } = supabase.storage.from(PUBLIC_MEDIA_BUCKET).getPublicUrl(objectPath);
    if(!data?.publicUrl) throw new Error('No se pudo obtener la URL pública del archivo.');
    return data.publicUrl;
}

module.exports = { uploadPublicMedia };
