const { askWithFallback } = require('./gemini');
const { SERVICES, findService } = require('../utils/appointmentsConfig');
const { parseDateText, parseTimeText, parsePeopleText } = require('../utils/dateTime');

const cleanJson = (text) => {
    const value = String(text || '').trim();
    const match = value.match(/\{[\s\S]*\}/);
    return match ? match[0] : value;
}

const findServiceByName = (name) => {
    if(!name) return null;
    return findService(name) || SERVICES.find((service) => service.id === name);
}

const withTimeout = (promise, ms) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Extractor timeout')), ms);
        })
    ]);
}

const manualExtract = (message, currentData = {}) => {
    const service = findService(message);
    return {
        name: currentData.name || null,
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
    const manualData = manualExtract(message, currentData);
    if(
        hasManualData(manualData) ||
        ['name', 'people', 'date', 'time', 'service'].includes(waitingFor) ||
        process.env.APPOINTMENT_EXTRACTOR_AI === 'false'
    ) {
        return manualData;
    }

    const servicesText = SERVICES.map((service) => `${service.name} (${service.id})`).join(', ');
    const prompt = [
        'Extrae datos para agendar una cita de Thessa.',
        'Devuelve solamente JSON valido, sin markdown ni explicaciones.',
        'Si un dato no aparece, usa null.',
        'No inventes datos.',
        'El nombre del cliente solo debe llenarse si el mensaje dice claramente "a nombre de", "me llamo", "soy" o una frase similar.',
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
        const service = findServiceByName(parsed.serviceId) || findServiceByName(parsed.serviceName);

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
