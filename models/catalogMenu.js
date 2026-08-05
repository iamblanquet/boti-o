const Messages = require('./messages');
const ServicesRepository = require('./servicesRepository');
const ResponseTemplates = require('./responseTemplates');
const ServiceFollowup = require('./serviceFollowup');
const AppointmentFlow = require('./citas/flujo');
const { getMessage } = require('../utils/systemMessageLoader');

const MAX_ROWS_PER_LIST = 10;
const CATALOG_UNAVAILABLE_MESSAGE = ServicesRepository.CATALOG_UNAVAILABLE_MESSAGE;
const CATEGORY_TITLE_ALIASES = {
    'tratamientos especializados': 'Trat. especializados'
};

const truncate = (value, maxLength) => {
    const text = String(value || '').trim();
    if(text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3).trim()}...`;
}

const normalizeTitle = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const formatCategoryTitle = (categoryName) => {
    const name = String(categoryName || '').trim();
    const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return CATEGORY_TITLE_ALIASES[normalized] || truncate(name, 24);
}

const formatServiceTitle = (serviceName) => {
    const clean = normalizeTitle(serviceName)
        .replace(/^Depilacion Laser -\s*/i, '')
        .trim();
    return truncate(clean, 24);
}

const formatServiceDescription = (service) => {
    const duration = service.duracionMinutos ? `${service.duracionMinutos} min` : null;
    const price = ResponseTemplates.formatPrice(service.precio);
    const details = [
        duration ? `Tiempo: ${duration}` : null,
        price ? `Precio: ${price}` : null
    ].filter(Boolean).join(' | ');

    return details || truncate(service.descripcion, 72);
}

const sendList = async ({ phoneNumber, body, button, sectionTitle, rows }) => {
    return Messages.sendMessage({
        phoneNumber,
        type: 'list',
        text: body,
        listPayload: {
            type: 'list',
            body: { text: body },
            action: {
                button: truncate(button, 20),
                sections: [{
                    title: truncate(sectionTitle, 24),
                    rows
                }]
            }
        }
    });
}

const sendCategoryList = async (phoneNumber) => {
    let categories = [];
    try {
        categories = await ServicesRepository.listCategories();
    } catch (error) {
        console.error('Catalog categories error:', error.message);
        await Messages.sendTextMessage(CATALOG_UNAVAILABLE_MESSAGE, phoneNumber);
        return true;
    }

    if(!categories.length) {
        await Messages.sendTextMessage(CATALOG_UNAVAILABLE_MESSAGE, phoneNumber);
        return true;
    }

    await sendList({
        phoneNumber,
        body: getMessage('catalog_category_intro'),
        button: 'Categorias',
        sectionTitle: 'Servicios Thessa',
        rows: categories.map((category) => ({
            id: `category_${category.id}`,
            title: formatCategoryTitle(category.nombre),
            description: `${category.count} servicios disponibles`
        }))
    });

    return true;
}

const sendServicesByCategory = async (phoneNumber, categoryName) => {
    let services = [];
    try {
        services = await ServicesRepository.listServicesByCategory(categoryName);
    } catch (error) {
        console.error('Catalog services error:', error.message);
        await Messages.sendTextMessage(CATALOG_UNAVAILABLE_MESSAGE, phoneNumber);
        return true;
    }

    if(!services.length) {
        await Messages.sendTextMessage(`No veo servicios disponibles en ${categoryName} por ahora. Te muestro las categorias para orientarte mejor.`, phoneNumber);
        return sendCategoryList(phoneNumber);
    }

    for(let index = 0; index < services.length; index += MAX_ROWS_PER_LIST) {
        const chunk = services.slice(index, index + MAX_ROWS_PER_LIST);
        const page = Math.floor(index / MAX_ROWS_PER_LIST) + 1;
        const totalPages = Math.ceil(services.length / MAX_ROWS_PER_LIST);

        await sendList({
            phoneNumber,
            body: page === 1
                ? getMessage('catalog_service_intro', { category: categoryName })
                : getMessage('catalog_service_more', { category: categoryName }),
            button: page === 1 ? 'Ver servicios' : `Mas ${page}/${totalPages}`,
            sectionTitle: totalPages > 1 ? `${categoryName} ${page}/${totalPages}` : categoryName,
            rows: chunk.map((service) => ({
                id: `service_${service.id}`,
                title: formatServiceTitle(service.nombre),
                description: truncate(formatServiceDescription(service), 72)
            }))
        });
    }

    return true;
}

const handlePayload = async (phoneNumber, messageText) => {
    const packageMatch = String(messageText || '').match(/^package:([^:]+):([a-f0-9-]+)$/i);
    if(packageMatch) {
        const service = await ServicesRepository.getServiceById(packageMatch[1]);
        const selectedPackage = service?.paquetes?.find((item) => item.id === packageMatch[2]);
        if(!service || !selectedPackage) return false;
        return AppointmentFlow.iniciarConServicio(phoneNumber, {
            ...service,
            paquete: selectedPackage
        });
    }
    const categoryMatch = String(messageText || '').match(/^category_(.+)$/);
    if(categoryMatch) {
        let category = null;
        try {
            category = await ServicesRepository.getCategoryById(categoryMatch[1]);
        } catch (error) {
            console.error('Catalog category payload error:', error.message);
            await Messages.sendTextMessage(CATALOG_UNAVAILABLE_MESSAGE, phoneNumber);
            return true;
        }
        if(!category) return sendCategoryList(phoneNumber);
        return sendServicesByCategory(phoneNumber, category.nombre);
    }

    const serviceMatch = String(messageText || '').match(/^service_(.+)$/);
    if(serviceMatch) {
        let service = null;
        try {
            service = await ServicesRepository.getServiceById(serviceMatch[1]);
        } catch (error) {
            console.error('Catalog service payload error:', error.message);
            await Messages.sendTextMessage(CATALOG_UNAVAILABLE_MESSAGE, phoneNumber);
            return true;
        }
        if(!service) {
            await Messages.sendTextMessage(getMessage('catalog_not_found'), phoneNumber);
            return sendCategoryList(phoneNumber);
        }

        await Messages.sendTextMessage(ResponseTemplates.serviceExact(service, 'general'), phoneNumber);
        if(service.imagen) {
            await Messages.sendLocalMedia(service.imagen, phoneNumber, { source: 'bot' });
        }
        if(service.paquetes?.length) {
            await sendList({
                phoneNumber,
                body: 'También contamos con paquetes de sesiones para este servicio.',
                button: 'Ver paquetes',
                sectionTitle: 'Paquetes',
                rows: service.paquetes.slice(0, MAX_ROWS_PER_LIST).map((item) => ({
                    id: `package:${service.id}:${item.id}`,
                    title: truncate(item.nombre, 24),
                    description: truncate(`${item.sesiones} sesiones · ${ResponseTemplates.formatPrice(item.precio)}`, 72)
                }))
            });
        }
        await ServiceFollowup.sendOfferDecisionButtons(phoneNumber, service);
        return true;
    }

    return false;
}

module.exports = {
    sendCategoryList,
    sendServicesByCategory,
    handlePayload
};
