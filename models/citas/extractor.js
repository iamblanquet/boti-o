const { askWithFallback } = require('../gemini');
const { parseDateText, parseTimeText, parsePeopleText } = require('../../utils/dateTime');
const ServicesRepository = require('../servicesRepository');

const cleanJson = (text) => {
    const value = String(text || '').trim();
    const match = value.match(/\{[\s\S]*\}/);
    return match ? match[0] : value;
}

const findServiceByName = async (name) => {
    if(!name) return null;
    const service = await ServicesRepository.getServiceById(name) || await ServicesRepository.findServiceByName(name);
    return ServicesRepository.toAppointmentService(service);
}

const parseAppointmentButtonPayload = (message) => {
    const value = String(message || '').trim();
    const serviceMatch = value.match(/^appt_service_([a-z0-9-]+)$/);
    const dateMatch = value.match(/^appt_date_(\d{4}-\d{2}-\d{2})$/);
    const timeMatch = value.match(/^appt_time_(\d{2})-(\d{2})$/);
    const peopleMatch = value.match(/^appt_people_(\d+)$/);
    const datesPageMatch = value.match(/^appt_dates_page_(\d+)$/);

    return {
        serviceId: serviceMatch ? serviceMatch[1] : null,
        date: dateMatch ? dateMatch[1] : null,
        time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null,
        people: peopleMatch ? Number(peopleMatch[1]) : null,
        datesPage: datesPageMatch ? Number(datesPageMatch[1]) : null
    };
}

const parseNameText = (message) => {
    const text = String(message || '').trim();
    const patterns = [
        /\b(?:a\s+nombre\s+de|me\s+llamo|mi\s+nombre\s+es)\s+([\p{L}\s]{2,60})(?=,|\.|$|\s+para\s+\d|\s+\d+\s*(?:persona|personas|pax))/iu
    ];

    for(const pattern of patterns) {
        const match = text.match(pattern);
        if(match) {
            return match[1]
                .replace(/\b(para|persona|personas|pax|manana|mañana|hoy)\b.*$/i, '')
                .trim()
                .replace(/\s+/g, ' ');
        }
    }

    return null;
}

const withTimeout = (promise, ms) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Extractor timeout')), ms);
        })
    ]);
}

const manualExtract = async (message, currentData = {}, waitingFor = null) => {
    const buttonPayload = parseAppointmentButtonPayload(message);
    const buttonService = buttonPayload.serviceId ? await findServiceByName(buttonPayload.serviceId) : null;
    if(buttonPayload.serviceId || buttonPayload.date || buttonPayload.time || buttonPayload.people) {
        return {
            name: currentData.name || null,
            serviceId: buttonService?.id || null,
            serviceName: buttonService?.name || null,
            durationMinutes: buttonService?.durationMinutes || null,
            people: buttonPayload.people,
            date: buttonPayload.date,
            time: buttonPayload.time
        };
    }

    if(waitingFor === 'people') {
        return {
            name: currentData.name || null,
            serviceId: null,
            serviceName: null,
            durationMinutes: null,
            people: parsePeopleText(message, true),
            date: null,
            time: null
        };
    }

    if(waitingFor === 'name') {
        return {
            name: parseNameText(message) || currentData.name || null,
            serviceId: null,
            serviceName: null,
            durationMinutes: null,
            people: null,
            date: null,
            time: null
        };
    }

    const service = await findServiceByName(message);
    return {
        name: parseNameText(message) || currentData.name || null,
        serviceId: service?.id || null,
        serviceName: service?.name || null,
        durationMinutes: service?.durationMinutes || null,
        people: parsePeopleText(message),
        date: parseDateText(message),
        time: parseTimeText(message)
    };
}

const hasManualData = (data) => Boolean(data.serviceId || data.people || data.date || data.time);

const extractAppointmentDetails = async ({ message, currentData = {}, waitingFor = null }) => {
    const manualData = await manualExtract(message, currentData, waitingFor);
    if(
        hasManualData(manualData) ||
        ['name', 'people', 'date', 'time', 'service'].includes(waitingFor) ||
        process.env.APPOINTMENT_EXTRACTOR_AI === 'false'
    ) {
        return manualData;
    }

    const services = await ServicesRepository.listActiveServices();
    const servicesText = services.map((service) => `${service.nombre} (${service.id})`).join(', ');
    const prompt = [
        'Extrae datos para agendar una cita de Thessa.',
        'Devuelve solamente JSON valido, sin markdown ni explicaciones.',
        'Si un dato no aparece, usa null.',
        'No inventes datos.',
        'El nombre del cliente solo debe llenarse si el mensaje dice claramente "a nombre de", "me llamo" o "mi nombre es".',
        'Nunca uses "Thessa" como nombre del cliente.',
        'Servicios validos:',
        servicesText,
        '',
        'Campos:',
        '{',
        '  "name": string|null,',
        '  "serviceId": string|null,',
        '  "people": number|null,',
        '  "date": "YYYY-MM-DD"|null,',
        '  "time": "HH:mm"|null',
        '}',
        '',
        `Dato que se estaba preguntando: ${waitingFor || 'ninguno'}`,
        `Datos actuales: ${JSON.stringify(currentData)}`,
        `Mensaje del cliente: ${message}`
    ].join('\n');

    try {
        const result = await withTimeout(askWithFallback({
            instructions: 'Eres un extractor de datos. Responde solo JSON valido.',
            history: [],
            message: prompt
        }), 4000);
        const parsed = JSON.parse(cleanJson(result.answer));
        const service = await findServiceByName(parsed.serviceId) || await findServiceByName(parsed.serviceName);

        return {
            name: parsed.name || null,
            serviceId: service?.id || null,
            serviceName: service?.name || null,
            durationMinutes: service?.durationMinutes || null,
            people: parsed.people || null,
            date: parsed.date || null,
            time: parsed.time || null
        };
    } catch (error) {
        console.error('Appointment extractor fallback:', error.message);
        return manualData;
    }
}

module.exports = { extractAppointmentDetails }
