const getSupabase = require('../config/supabase');
const { normalizeText } = require('../utils/configCitas');

const CATALOG_UNAVAILABLE_MESSAGE = 'Dame un momentito, quiero confirmarte la informacion correcta con el equipo para orientarte bien.';
const SERVICE_IMAGE_BUCKET = 'service-images';

let testClient = null;

class ServiceCatalogUnavailableError extends Error {
    constructor(message = CATALOG_UNAVAILABLE_MESSAGE, cause = null) {
        super(message);
        this.name = 'ServiceCatalogUnavailableError';
        this.status = 503;
        this.code = 'SERVICE_CATALOG_UNAVAILABLE';
        this.cause = cause;
    }
}

const getClient = () => testClient || getSupabase();

const requireClient = () => {
    const supabase = getClient();
    if(!supabase) throw new ServiceCatalogUnavailableError();
    return supabase;
}

const slug = (value, fallback = 'item') => normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `${fallback}-${Date.now()}`;

const normalizeArray = (value) => {
    if(Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
    if(value === null || value === undefined || value === '') return [];
    return String(value)
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
}

const cleanNumber = (value) => {
    if(value === null || value === undefined || value === '') return null;
    const number = Number(String(value).replace(/[^\d.]/g, ''));
    return Number.isFinite(number) ? number : null;
}

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

// El catálogo solo conserva URLs públicas. Así evitamos volver a usar rutas
// locales como /mediaFiles/... para imágenes de servicios.
const normalizeRemoteImage = (value) => {
    const image = String(value || '').trim();
    return /^https?:\/\/\S+$/i.test(image) ? image : '';
}

const getServiceImagePath = (imageUrl) => {
    try {
        const url = new URL(imageUrl);
        const prefix = `/storage/v1/object/public/${SERVICE_IMAGE_BUCKET}/`;
        if(!url.pathname.startsWith(prefix)) return null;
        const objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
        return objectPath.startsWith('services/') ? objectPath : null;
    } catch {
        return null;
    }
}

const removeStoredServiceImage = async (supabase, imageUrl) => {
    const objectPath = getServiceImagePath(imageUrl);
    if(!objectPath || !supabase.storage) return;

    const { error } = await supabase.storage.from(SERVICE_IMAGE_BUCKET).remove([objectPath]);
    if(error) console.log('No se pudo eliminar la imagen anterior del servicio:', error.message);
}

const normalizePersonPrices = (items, fallbackPrice = null) => {
    const source = Array.isArray(items) ? items : [];
    const normalized = source
        .map((item) => ({
            personas: cleanNumber(item.personas ?? item.people),
            precio: cleanNumber(item.precio ?? item.price),
            exclusivo: item.exclusivo === true || item.exclusive === true,
            nota: String(item.nota ?? item.note ?? '').trim()
        }))
        .filter((item) => item.personas && item.precio !== null)
        .sort((a, b) => a.personas - b.personas);

    if(normalized.length) {
        return Array.from(normalized.reduce((result, item) => {
            result.set(item.personas, item);
            return result;
        }, new Map()).values());
    }

    const price = cleanNumber(fallbackPrice);
    return price !== null ? [{ personas: 1, precio: price, exclusivo: false, nota: '' }] : [];
}

const normalizeCategoryPayload = (payload = {}, fallback = {}) => {
    const name = String(payload.nombre || payload.name || fallback.nombre || fallback.name || '').trim();
    const id = String(payload.id || fallback.id || slug(name, 'categoria')).trim();

    return {
        id,
        name,
        active: payload.activo ?? payload.active ?? fallback.activo ?? fallback.active ?? true,
        sort_order: cleanNumber(payload.sortOrder ?? payload.sort_order ?? fallback.sort_order) ?? 0
    };
}

const normalizeServicePayload = (payload = {}, fallback = {}) => {
    const categoryName = String(payload.categoria || payload.category || fallback.categoria || fallback.category || 'Servicios').trim();
    const name = String(payload.nombre || payload.name || fallback.nombre || fallback.name || '').trim();
    const fallbackPrices = normalizePersonPrices(fallback.preciosPersonas || fallback.service_prices, fallback.precio ?? fallback.price);
    const prices = normalizePersonPrices(
        payload.preciosPersonas || payload.preciosPorPersona || payload.service_prices || fallbackPrices,
        payload.precio ?? payload.price ?? fallback.precio ?? fallback.price
    );
    const firstPrice = prices[0]?.precio;
    const explicitPrice = cleanNumber(payload.precio ?? payload.price ?? fallback.precio ?? fallback.price);
    const requestedImage = hasOwn(payload, 'imagen')
        ? payload.imagen
        : hasOwn(payload, 'image')
            ? payload.image
            : (fallback.imagen ?? fallback.image ?? '');

    return {
        service: {
            id: String(payload.id || fallback.id || slug(name, 'servicio')).trim(),
            category_id: String(payload.categoryId || payload.category_id || fallback.category_id || slug(categoryName, 'categoria')).trim(),
            name,
            description: String(payload.descripcion || payload.description || fallback.descripcion || fallback.description || '').trim(),
            pre_care_message: String(
                payload.cuidadosPrevios
                ?? payload.preCareMessage
                ?? payload.pre_care_message
                ?? fallback.cuidadosPrevios
                ?? fallback.preCareMessage
                ?? fallback.pre_care_message
                ?? ''
            ).trim(),
            post_care_message: String(
                payload.cuidadosPosteriores
                ?? payload.postCareMessage
                ?? payload.post_care_message
                ?? fallback.cuidadosPosteriores
                ?? fallback.postCareMessage
                ?? fallback.post_care_message
                ?? ''
            ).trim(),
            duration_minutes: cleanNumber(payload.duracionMinutos ?? payload.duration_minutes ?? fallback.duracionMinutos ?? fallback.duration_minutes),
            price: prices.length ? firstPrice : explicitPrice,
            image: normalizeRemoteImage(requestedImage),
            benefits: normalizeArray(payload.beneficios ?? payload.benefits ?? fallback.beneficios ?? fallback.benefits),
            problems: normalizeArray(payload.problemas ?? payload.problems ?? fallback.problemas ?? fallback.problems),
            keywords: normalizeArray(payload.keywords ?? fallback.keywords),
            active: payload.activo ?? payload.active ?? fallback.activo ?? fallback.active ?? true,
            sort_order: cleanNumber(payload.sortOrder ?? payload.sort_order ?? fallback.sort_order) ?? 0
        },
        categoryName,
        prices
    };
}

const assertNoError = (error) => {
    if(error) throw new ServiceCatalogUnavailableError(undefined, error);
}

const selectAll = async (table, select = '*') => {
    const supabase = requireClient();
    const { data, error } = await supabase.from(table).select(select);
    assertNoError(error);
    return data || [];
}

const mapCategories = (rows = [], services = []) => {
    const activeServices = services.filter((service) => service.active !== false);
    const counts = activeServices.reduce((result, service) => {
        result[service.category_id] = (result[service.category_id] || 0) + 1;
        return result;
    }, {});

    return rows
        .filter((category) => category.active !== false)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name), 'es'))
        .map((category) => ({
            id: category.id,
            nombre: category.name,
            count: counts[category.id] || 0
        }));
}

const mapService = (service, categoryById, pricesByService) => {
    const categoryName = categoryById.get(service.category_id)?.name || service.category_id || 'Servicios';
    const prices = (pricesByService.get(service.id) || [])
        .sort((a, b) => Number(a.people) - Number(b.people))
        .map((item) => ({
            personas: Number(item.people),
            precio: Number(item.price),
            exclusivo: item.exclusive === true,
            nota: item.note || ''
        }));

    return {
        id: service.id,
        categoriaId: service.category_id,
        categoria: categoryName,
        nombre: service.name,
        descripcion: service.description || '',
        cuidadosPrevios: service.pre_care_message || '',
        cuidadosPosteriores: service.post_care_message || '',
        duracionMinutos: service.duration_minutes === null || service.duration_minutes === undefined ? null : Number(service.duration_minutes),
        precio: service.price === null || service.price === undefined ? null : Number(service.price),
        preciosPersonas: prices,
        imagen: normalizeRemoteImage(service.image),
        activo: service.active !== false,
        problemas: normalizeArray(service.problems),
        keywords: normalizeArray(service.keywords),
        beneficios: normalizeArray(service.benefits),
        sortOrder: service.sort_order || 0
    };
}

const loadCatalog = async (options = {}) => {
    const allowEmpty = options.allowEmpty === true;
    const [categoriesRaw, servicesRaw, pricesRaw, faqsRaw] = await Promise.all([
        selectAll('service_categories'),
        selectAll('services'),
        selectAll('service_prices'),
        selectAll('service_faqs')
    ]);
    const hasActiveCategories = categoriesRaw.some((category) => category.active !== false);
    const hasActiveServices = servicesRaw.some((service) => service.active !== false);
    if(!allowEmpty && (!hasActiveCategories || !hasActiveServices)) {
        throw new ServiceCatalogUnavailableError();
    }

    const categoryById = new Map(categoriesRaw.map((category) => [category.id, category]));
    const pricesByService = pricesRaw.reduce((result, price) => {
        if(!result.has(price.service_id)) result.set(price.service_id, []);
        result.get(price.service_id).push(price);
        return result;
    }, new Map());

    const services = servicesRaw
        .map((service) => mapService(service, categoryById, pricesByService))
        .filter((service) => service.activo !== false)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.nombre.localeCompare(b.nombre, 'es'));

    return {
        categories: mapCategories(categoriesRaw, servicesRaw),
        services,
        faqs: faqsRaw
            .filter((faq) => faq.active !== false)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.question).localeCompare(String(b.question), 'es'))
            .map((faq) => ({
                id: faq.id,
                pregunta: faq.question,
                respuesta: faq.answer,
                activo: faq.active !== false
            }))
    };
}

const readEditableCatalog = async () => {
    const catalog = await loadCatalog({ allowEmpty: true });
    return {
        source: 'supabase',
        categories: catalog.categories,
        services: catalog.services
    };
}

const upsertCategory = async (payload, fallback = {}) => {
    const category = normalizeCategoryPayload(payload, fallback);
    if(!category.name) {
        const error = new Error('Nombre de categoria requerido');
        error.status = 400;
        throw error;
    }

    const supabase = requireClient();
    const { error } = await supabase.from('service_categories').upsert(category, { onConflict: 'id' });
    assertNoError(error);
    return category;
}

const replaceServicePrices = async (serviceId, prices) => {
    const supabase = requireClient();
    const { error: deleteError } = await supabase.from('service_prices').delete().eq('service_id', serviceId);
    assertNoError(deleteError);

    if(!prices.length) return;

    const rows = prices.map((item) => ({
        service_id: serviceId,
        people: item.personas,
        price: item.precio,
        exclusive: item.exclusivo,
        note: item.nota
    }));
    const { error } = await supabase.from('service_prices').insert(rows);
    assertNoError(error);

    const savedRows = (await selectAll('service_prices'))
        .filter((row) => row.service_id === serviceId);

    if(savedRows.length !== rows.length) {
        throw new ServiceCatalogUnavailableError('No se pudieron confirmar los precios guardados en Supabase.');
    }
}

const createService = async (payload) => {
    const { service, categoryName, prices } = normalizeServicePayload(payload);
    if(!service.name) {
        const error = new Error('Nombre requerido');
        error.status = 400;
        throw error;
    }

    await upsertCategory({ id: service.category_id, name: categoryName });
    const supabase = requireClient();
    const { error } = await supabase.from('services').insert(service);
    assertNoError(error);
    await replaceServicePrices(service.id, prices);
    return readEditableCatalog();
}

const upsertService = async (payload) => {
    const { service, categoryName, prices } = normalizeServicePayload(payload);
    if(!service.name) {
        const error = new Error('Nombre requerido');
        error.status = 400;
        throw error;
    }

    await upsertCategory({ id: service.category_id, name: categoryName });
    const supabase = requireClient();
    const { error } = await supabase.from('services').upsert(service, { onConflict: 'id' });
    assertNoError(error);
    await replaceServicePrices(service.id, prices);
    return service;
}

const updateService = async (id, payload) => {
    const catalog = await loadCatalog({ allowEmpty: true });
    const current = catalog.services.find((service) => service.id === id);
    if(!current) {
        const error = new Error('Servicio no encontrado');
        error.status = 404;
        throw error;
    }

    const { service, categoryName, prices } = normalizeServicePayload(payload, {
        id,
        category_id: current.categoriaId,
        categoria: current.categoria,
        name: current.nombre,
        description: current.descripcion,
        pre_care_message: current.cuidadosPrevios,
        post_care_message: current.cuidadosPosteriores,
        duration_minutes: current.duracionMinutos,
        price: current.precio,
        image: current.imagen,
        benefits: current.beneficios,
        problems: current.problemas,
        keywords: current.keywords,
        active: current.activo,
        service_prices: current.preciosPersonas
    });
    service.id = id;

    if(!service.name) {
        const error = new Error('Nombre requerido');
        error.status = 400;
        throw error;
    }

    await upsertCategory({ id: service.category_id, name: categoryName });
    const supabase = requireClient();
    const { error } = await supabase.from('services').update(service).eq('id', id);
    assertNoError(error);
    await replaceServicePrices(id, prices);
    if(current.imagen && current.imagen !== service.image) {
        await removeStoredServiceImage(supabase, current.imagen);
    }
    return readEditableCatalog();
}

const deleteService = async (id) => {
    const supabase = requireClient();
    const catalog = await loadCatalog({ allowEmpty: true });
    const current = catalog.services.find((service) => service.id === id);
    const { error } = await supabase.from('services').delete().eq('id', id);
    assertNoError(error);
    if(current?.imagen) await removeStoredServiceImage(supabase, current.imagen);
    return readEditableCatalog();
}

const createCategory = async (payload) => {
    await upsertCategory(payload);
    return readEditableCatalog();
}

const updateCategory = async (id, payload) => {
    const catalog = await loadCatalog({ allowEmpty: true });
    const current = catalog.categories.find((category) => category.id === id);
    if(!current) {
        const error = new Error('Categoria no encontrada');
        error.status = 404;
        throw error;
    }

    const next = normalizeCategoryPayload({ ...payload, id }, current);
    if(!next.name) {
        const error = new Error('Nombre de categoria requerido');
        error.status = 400;
        throw error;
    }

    const supabase = requireClient();
    const { error } = await supabase.from('service_categories').update(next).eq('id', id);
    assertNoError(error);
    return readEditableCatalog();
}

const deleteCategory = async (id) => {
    const supabase = requireClient();
    const { error } = await supabase.from('service_categories').delete().eq('id', id);
    assertNoError(error);
    return readEditableCatalog();
}

const upsertFaq = async (faq) => {
    const supabase = requireClient();
    const row = {
        id: faq.id || slug(faq.pregunta || faq.question, 'faq'),
        question: String(faq.pregunta || faq.question || '').trim(),
        answer: String(faq.respuesta || faq.answer || '').trim(),
        active: faq.activo ?? faq.active ?? true,
        sort_order: cleanNumber(faq.sortOrder ?? faq.sort_order) ?? 0
    };
    const { error } = await supabase.from('service_faqs').upsert(row, { onConflict: 'id' });
    assertNoError(error);
    return row;
}

const setTestClient = (client) => {
    testClient = client;
}

module.exports = {
    CATALOG_UNAVAILABLE_MESSAGE,
    ServiceCatalogUnavailableError,
    loadCatalog,
    readEditableCatalog,
    createService,
    upsertService,
    updateService,
    deleteService,
    createCategory,
    updateCategory,
    deleteCategory,
    upsertCategory,
    upsertFaq,
    replaceServicePrices,
    normalizeServicePayload,
    normalizeCategoryPayload,
    __setTestClient: setTestClient
};
