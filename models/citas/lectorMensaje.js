const {
    parseDateText,
    parseTimeText,
    parsePeopleText
} = require('../../utils/dateTime');
const { extractAppointmentDetails } = require('./extractor');
const {
    extractAppointmentData,
    mergeDefinedData
} = require('./datos');
const { hasAnyAppointmentData } = require('./reglas');
const { sendServiceButtonsByCategory } = require('./preguntas');

const getDataFromMessage = async (phoneNumber, flow, message) => {
    const extractedByAi = await extractAppointmentDetails({ message, currentData: flow.data, waitingFor: flow.waitingFor });
    const manual = await extractAppointmentData(message);
    const previous = flow.data || {};

    if(flow.waitingFor === 'service' && manual.categoryId && !manual.serviceId) {
        await sendServiceButtonsByCategory(phoneNumber, manual.categoryId);
        return { data: flow.data || {}, manual: {} };
    }

    if(flow.waitingFor === 'people') {
        const data = { ...flow.data };
        const people = extractedByAi.people || manual.people || parsePeopleText(message, true);
        if(people) data.people = people;
        if(!people && (extractedByAi.serviceId || extractedByAi.date || extractedByAi.time || manual.serviceId || manual.date || manual.time)) {
            const updated = await mergeDefinedData(await mergeDefinedData(data, extractedByAi), manual);
            updated.slotValidated = false;
            return { data: updated, manual };
        }
        return { data, manual };
    }

    if(flow.waitingFor === 'name') {
        const data = { ...flow.data };
        if(extractedByAi.serviceId || extractedByAi.date || extractedByAi.time || manual.serviceId || manual.date || manual.time) {
            const updated = await mergeDefinedData(await mergeDefinedData(data, extractedByAi), manual);
            updated.slotValidated = false;
            return { data: updated, manual };
        }
        if(extractedByAi.name) data.name = extractedByAi.name;
        else if(!hasAnyAppointmentData(manual)) data.name = String(message || '').trim();
        return { data, manual };
    }

    let data = await mergeDefinedData(flow.data, extractedByAi);
    data = await mergeDefinedData(data, manual);

    if(flow.waitingFor === 'date' && !data.date) data.date = parseDateText(message);
    if(flow.waitingFor === 'time' && !data.time) data.time = parseTimeText(message);
    if(data.date !== previous.date && !manual.time && !extractedByAi.time) {
        data.time = null;
    }
    if(data.serviceId !== previous.serviceId || data.date !== previous.date || data.time !== previous.time) {
        data.slotValidated = false;
    }

    return { data, manual };
}

module.exports = {
    getDataFromMessage
};
