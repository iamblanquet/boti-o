const { normalizeText } = require('../utils/configCitas');
const CatalogStore = require('./serviceCatalogStore');

const normalizeArray = (items) => (Array.isArray(items) ? items : [])
    .map((item) => normalizeText(item).trim())
    .filter(Boolean);

const normalizeServiceSearchText = (value) => normalizeText(value)
    .replace(/\bmasajante\b/g, 'masaje')
    .replace(/\bmasage\b/g, 'masaje')
    .replace(/\bmasages\b/g, 'masajes');

const listActiveServices = async () => {
    const catalog = await CatalogStore.loadCatalog();
    return catalog.services
        .filter((service) => service.activo !== false)
        .map((service) => ({
            ...service,
            problemas: normalizeArray(service.problemas),
            keywords: normalizeArray(service.keywords),
            beneficios: Array.isArray(service.beneficios) ? service.beneficios : [],
            productos: Array.isArray(service.productos) ? service.productos : []
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

const listCategories = async () => {
    const catalog = await CatalogStore.loadCatalog();
    return catalog.categories;
}

const getCategoryAliases = (category) => {
    const value = normalizeServiceSearchText(category);
    const aliases = [value];

    if(value.includes('depilacion')) aliases.push('depilacion', 'depilaciones', 'laser depilacion', 'depilacion laser');
    if(value.includes('facial')) aliases.push('facial', 'faciales', 'tratamientos faciales');
    if(value.includes('masaje')) aliases.push('masaje', 'masajes', 'masajante');
    if(value.includes('paquete')) aliases.push('paquete', 'paquetes');
    if(value.includes('tratamientos especializados')) aliases.push('tratamiento especializado', 'tratamientos especializados', 'laser', 'hifu');

    return Array.from(new Set(aliases));
}

const GENERIC_SERVICE_TERMS = new Set([
    'servicio',
    'servicios',
    'tratamiento',
    'tratamientos',
    'depilacion',
    'depilaciones',
    'laser',
    'masaje',
    'masajes',
    'facial',
    'faciales',
    'paquete',
    'paquetes',
    'limpieza'
]);

const toAppointmentService = (service) => service ? {
    id: service.id,
    name: service.nombre,
    durationMinutes: service.duracionMinutos,
    price: service.precio,
    personPrices: service.preciosPersonas || [],
    keywords: [
        service.nombre,
        ...(service.keywords || []),
        ...(service.problemas || [])
    ].filter(Boolean)
} : null;

const findCategoryByMessage = async (message) => {
    const value = normalizeServiceSearchText(message);
    const categories = await listCategories();

    const ranked = categories
        .map((category) => {
            const score = getCategoryAliases(category.nombre).reduce((bestScore, alias) => {
                const normalizedAlias = normalizeServiceSearchText(alias);
                if(!value.includes(normalizedAlias)) return bestScore;

                const wordCount = normalizedAlias.split(/\s+/).filter(Boolean).length;
                return Math.max(bestScore, normalizedAlias.length + (wordCount * 10));
            }, 0);

            return { category, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

    return ranked[0]?.category || null;
}

const getCategoryById = async (id) => {
    const categories = await listCategories();
    return categories.find((category) => category.id === id) || null;
}

const listServicesByCategory = async (categoryName) => {
    const services = await listActiveServices();
    const target = normalizeServiceSearchText(categoryName);

    return services.filter((service) => normalizeServiceSearchText(service.categoria) === target);
}

const scoreServiceMatch = (service, query) => {
    const value = normalizeServiceSearchText(query);
    const name = normalizeServiceSearchText(service.nombre);
    const compactValue = value.replace(/\s+/g, '');
    const compactName = name.replace(/\s+/g, '');
    const description = normalizeServiceSearchText(service.descripcion);
    const benefits = normalizeServiceSearchText((service.beneficios || []).join(' '));
    const keywords = normalizeServiceSearchText([...(service.keywords || []), ...(service.problemas || [])].join(' '));
    const queryWords = value.split(/\s+/).filter((word) => word.length > 3);
    const serviceWords = name.split(/\s+/).filter((word) => word.length > 3);
    const matchedNameWords = serviceWords.filter((word) => queryWords.includes(word)).length;

    let score = 0;
    if(value.includes(name)) score += 100;
    if(name.includes(value)) score += 80;
    if(compactValue.includes(compactName)) score += 100;
    if(compactName.includes(compactValue)) score += 80;
    if(serviceWords.length && matchedNameWords === serviceWords.length) score += 90;
    if(matchedNameWords) score += matchedNameWords * 30;
    if(keywords && queryWords.some((word) => keywords.includes(word))) score += 30;
    if(description && queryWords.some((word) => description.includes(word))) score += 15;
    if(benefits && queryWords.some((word) => benefits.includes(word))) score += 10;
    return score;
}

const isSpecificServiceMatch = (service, query) => {
    const value = normalizeServiceSearchText(query);
    const name = normalizeServiceSearchText(service.nombre);
    const compactValue = value.replace(/\s+/g, '');
    const compactName = name.replace(/\s+/g, '');

    if(value.includes(name) || compactValue.includes(compactName)) return true;

    const queryWords = value.split(/\s+/).filter((word) => word.length > 3);
    const serviceWords = name.split(/\s+/).filter((word) => word.length > 3);
    const matchedNameWords = serviceWords.filter((word) => queryWords.includes(word)).length;
    const distinctiveWords = serviceWords.filter((word) => !GENERIC_SERVICE_TERMS.has(word));
    const matchedDistinctiveWords = distinctiveWords.filter((word) => queryWords.includes(word)).length;
    const hasGenericServiceTerm = queryWords.some((word) => GENERIC_SERVICE_TERMS.has(word));

    if(!distinctiveWords.length) {
        return serviceWords.length > 0 && matchedNameWords === serviceWords.length;
    }

    return matchedDistinctiveWords > 0 && (
        matchedDistinctiveWords === distinctiveWords.length ||
        matchedNameWords >= 3 ||
        hasGenericServiceTerm
    );
}

const findServiceByName = async (query) => {
    const normalizedQuery = normalizeServiceSearchText(query).trim();
    if(normalizedQuery.length < 3) return null;

    const services = await listActiveServices();
    const ranked = services
        .map((service) => ({ service, score: scoreServiceMatch(service, query) }))
        .filter((item) => item.score >= 80 && isSpecificServiceMatch(item.service, query))
        .sort((a, b) => b.score - a.score);

    return ranked[0]?.service || null;
}

const getServiceById = async (id) => {
    const services = await listActiveServices();
    return services.find((service) => service.id === id) || null;
}

const findFaqAnswer = async (message) => {
    const value = normalizeServiceSearchText(message);
    const words = value.split(/\s+/).filter((word) => word.length > 3);
    const catalog = await CatalogStore.loadCatalog();

    const ranked = catalog.faqs
        .map((faq) => {
            const question = normalizeServiceSearchText(faq.pregunta);
            const answer = normalizeServiceSearchText(faq.respuesta);
            const matches = words.filter((word) => question.includes(word) || answer.includes(word)).length;
            return { faq, score: question.includes(value) ? 100 : matches };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

    return ranked[0]?.faq || null;
}

const listPromotionServices = async () => {
    const categories = await listCategories();
    const promotionCategory = categories.find((category) => {
        const value = normalizeServiceSearchText(category.nombre);
        return ['promocion', 'promociones', 'oferta', 'ofertas', 'descuento', 'descuentos']
            .some((keyword) => value.includes(keyword));
    });

    if(!promotionCategory) return [];
    return listServicesByCategory(promotionCategory.nombre);
}

const getActivePromotions = async (serviceId = null) => {
    const promotions = await listPromotionServices();
    return promotions
        .filter((service) => !serviceId || service.id === serviceId)
        .map((service) => ({
            titulo: service.nombre,
            descripcion: service.descripcion || 'Promocion disponible en Thessa.',
            servicioNombre: service.nombre
        }));
}

const cacheManager = require('../utils/cacheManager');
const KNOWLEDGE_BASE_CACHE_KEY = 'ai_knowledge_base';

const buildKnowledgeBase = async (forceRefresh = false) => {
    if (!forceRefresh) {
        const cached = cacheManager.get(KNOWLEDGE_BASE_CACHE_KEY);
        if (cached) return cached;
    }

    const catalog = await CatalogStore.loadCatalog();
    const categoryLines = catalog.categories.map((category) => `Categoria: ${category.nombre}`).join('\n');
    const serviceLines = catalog.services.map((service) => [
        `P: ${service.nombre}`,
        `Categoria: ${service.categoria}`,
        service.descripcion ? `Descripcion: ${service.descripcion}` : null,
        service.duracionMinutos ? `Duracion: ${service.duracionMinutos} minutos` : null,
        service.precio ? `Precio base: $${service.precio}` : null,
        service.preciosPersonas?.length ? `Precios: ${service.preciosPersonas.map((item) => `${item.personas} persona${item.personas === 1 ? '' : 's'} $${item.precio}${item.nota ? ` (${item.nota})` : ''}`).join(', ')}` : null,
        service.paquetes?.length ? `Paquetes: ${service.paquetes.map((item) => `${item.nombre} (${item.sesiones} sesiones por $${item.precio})`).join(', ')}` : null,
        service.beneficios?.length ? `Beneficios: ${service.beneficios.join(', ')}` : null,
        service.productos?.length ? `Productos utilizados: ${service.productos.join(', ')}` : null,
        service.cuidadosPrevios ? `Cuidados previos: ${service.cuidadosPrevios}` : null,
        service.cuidadosPosteriores ? `Cuidados posteriores: ${service.cuidadosPosteriores}` : null
    ].filter(Boolean).join('\n')).join('\n\n');
    const faqLines = catalog.faqs.map((faq) => `P: ${faq.pregunta}\nR: ${faq.respuesta}`).join('\n\n');

    const result = [
        'Thessa Clinica Integral de Belleza y Salud - base de conocimiento',
        categoryLines,
        '',
        'Servicios',
        serviceLines,
        '',
        'Preguntas frecuentes',
        faqLines
    ].join('\n').trim();

    cacheManager.set(KNOWLEDGE_BASE_CACHE_KEY, result, 5 * 60 * 1000);
    return result;
}

module.exports = {
    listActiveServices,
    listCategories,
    findCategoryByMessage,
    getCategoryById,
    listServicesByCategory,
    findServiceByName,
    getServiceById,
    toAppointmentService,
    findFaqAnswer,
    getActivePromotions,
    listPromotionServices,
    buildKnowledgeBase,
    ServiceCatalogUnavailableError: CatalogStore.ServiceCatalogUnavailableError,
    CATALOG_UNAVAILABLE_MESSAGE: CatalogStore.CATALOG_UNAVAILABLE_MESSAGE
};
