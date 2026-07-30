const ServicesRepository = require('../servicesRepository');
const Messages = require('../messages');
const { getMessage } = require('../../utils/systemMessageLoader');
const {
    truncateListText,
    cleanServiceTitle,
    sendButtonMessage,
    sendButtonGroups,
    sendListMessage
} = require('./mensajesWhatsapp');
const {
    getBusinessHoursText,
    getServiceLabel,
    formatDayButtonTitle
} = require('./formato');
const {
    findAvailableSlotsForDate,
    findAvailableDaysThisWeek
} = require('./disponibilidad');

const MAX_ROWS_PER_LIST = 10;
const CATALOG_UNAVAILABLE_MESSAGE = ServicesRepository.CATALOG_UNAVAILABLE_MESSAGE;

const sendTextMessage = (phoneNumber, message) => Messages.sendTextMessage(message, phoneNumber);

const sendServiceButtons = async (phoneNumber) => {
    let categories = [];
    try {
        categories = await ServicesRepository.listCategories();
    } catch (error) {
        console.error('Appointment service catalog error:', error.message);
        await sendTextMessage(phoneNumber, CATALOG_UNAVAILABLE_MESSAGE);
        return true;
    }
    if(!categories.length) {
        await sendTextMessage(phoneNumber, CATALOG_UNAVAILABLE_MESSAGE);
        return true;
    }

    await sendListMessage(phoneNumber, {
        body: getMessage('service_category_intro'),
        button: 'Categorias',
        sectionTitle: 'Servicios Thessa',
        rows: categories.map((category) => ({
            id: `appt_category_${category.id}`,
            title: truncateListText(category.nombre, 24),
            description: `${category.count} servicios`
        }))
    });
    return true;
}

const sendServiceButtonsByCategory = async (phoneNumber, categoryId) => {
    let category = null;
    try {
        category = await ServicesRepository.getCategoryById(categoryId);
    } catch (error) {
        console.error('Appointment category catalog error:', error.message);
        await sendTextMessage(phoneNumber, CATALOG_UNAVAILABLE_MESSAGE);
        return true;
    }
    if(!category) return sendServiceButtons(phoneNumber);

    let services = [];
    try {
        services = await ServicesRepository.listServicesByCategory(category.nombre);
    } catch (error) {
        console.error('Appointment services catalog error:', error.message);
        await sendTextMessage(phoneNumber, CATALOG_UNAVAILABLE_MESSAGE);
        return true;
    }
    if(!services.length) {
        await sendTextMessage(phoneNumber, `No veo servicios disponibles en ${category.nombre} por ahora. Te muestro de nuevo las categorias.`);
        return sendServiceButtons(phoneNumber);
    }

    for(let index = 0; index < services.length; index += MAX_ROWS_PER_LIST) {
        const chunk = services.slice(index, index + MAX_ROWS_PER_LIST);
        const page = Math.floor(index / MAX_ROWS_PER_LIST) + 1;
        const totalPages = Math.ceil(services.length / MAX_ROWS_PER_LIST);

        await sendListMessage(phoneNumber, {
            body: page === 1
                ? getMessage('service_select_intro', { category: category.nombre })
                : getMessage('service_select_more', { category: category.nombre }),
            button: page === 1 ? 'Ver servicios' : `Mas ${page}/${totalPages}`,
            sectionTitle: totalPages > 1 ? `${category.nombre} ${page}/${totalPages}` : category.nombre,
            rows: chunk.map((service) => ({
                id: `appt_service_${service.id}`,
                title: truncateListText(cleanServiceTitle(service.nombre), 24),
                description: truncateListText([
                    service.duracionMinutos ? `${service.duracionMinutos} min` : '',
                    service.precio ? `$${Number(service.precio).toLocaleString('es-MX')}` : ''
                ].filter(Boolean).join(' - '), 72)
            }))
        });
    }
    return true;
}

const sendAvailableDayButtons = async (phoneNumber, data) => {
    try {
        const days = await findAvailableDaysThisWeek(data);
        if(!days.length) {
            await sendTextMessage(phoneNumber, getMessage('date_no_availability', {
                service: getServiceLabel(data),
                hours: getBusinessHoursText()
            }));
            return true;
        }

        await sendButtonGroups(
            phoneNumber,
            getMessage('date_select_intro', { service: getServiceLabel(data) }),
            days.map((day) => ({
                id: `appt_date_${day.date}`,
                title: day.title
            }))
        );
        return true;
    } catch (error) {
        console.error('Available days error:', error.message);
        await sendTextMessage(phoneNumber, 'Dame un momentito, no pude verificar los dias disponibles en el calendario. Lo revisamos con el equipo para confirmarte bien.');
        return true;
    }
}

const sendAvailableTimeButtons = async (phoneNumber, data) => {
    try {
        const slots = await findAvailableSlotsForDate(data);
        if(!slots.length) {
            await sendTextMessage(phoneNumber, getMessage('time_no_availability', {
                service: getServiceLabel(data),
                hours: getBusinessHoursText()
            }));
            return true;
        }

        await sendButtonGroups(
            phoneNumber,
            getMessage('time_select_intro', { day: formatDayButtonTitle(data.date) }),
            slots.map((slot) => ({
                id: `appt_time_${slot.time.replace(':', '-')}`,
                title: slot.time
            }))
        );
        return true;
    } catch (error) {
        console.error('Available times error:', error.message);
        await sendTextMessage(phoneNumber, 'Dame un momentito, no pude verificar horarios exactos en el calendario. Lo revisamos con el equipo para confirmarte bien.');
        return true;
    }
}

const sendPeopleButtons = async (phoneNumber) => {
    await sendButtonMessage(phoneNumber, getMessage('people_select_intro'), [
        { id: 'appt_people_1', title: '1 persona' },
        { id: 'appt_people_2', title: '2 personas' },
        { id: 'appt_people_3', title: '3 personas' }
    ]);
    return true;
}

const askForField = async (phoneNumber, field, data = {}) => {
    if(field === 'service') return sendServiceButtons(phoneNumber);
    if(field === 'date') return sendAvailableDayButtons(phoneNumber, data);
    if(field === 'time') return sendAvailableTimeButtons(phoneNumber, data);
    if(field === 'people') return sendPeopleButtons(phoneNumber);
    if(field === 'participantNames') {
        await sendTextMessage(phoneNumber, 'Perfecto. Compárteme los nombres completos de las dos personas, separados por una coma.\n\nEjemplo: Ana López, Beatriz Pérez');
        return true;
    }

    await sendTextMessage(phoneNumber, getMessage('name_ask_intro'));
    return true;
}

module.exports = {
    sendAvailableDayButtons,
    sendServiceButtonsByCategory,
    sendAvailableTimeButtons,
    askForField
};
