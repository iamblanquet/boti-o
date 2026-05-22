const Messages = require('./messages');
const { findService, normalizeText } = require('../utils/appointmentsConfig');

const SERVICE_DETAILS = {
    'lumi-piel': {
        text: [
            'Claro, te cuento. Lumi Piel es una experiencia facial hidratante con chocolaterapia, ideal para devolverle luminosidad y frescura a la piel ✨\n\n',
            'Incluye limpieza facial profunda, exfoliacion suave, activos humectantes, chocolaterapia facial, aceites esenciales con notas de chocolate y copa de vino.\n\n',
            'Precios:\n',
            '- 1 persona: $1299\n',
            '- 2 personas: $1800'
        ].join(''),
        media: 'hydratation.jpeg'
    },
    'chocolaterapia-for-her': {
        text: [
            'Con gusto. Chocolaterapia for Her es un ritual corporal envolvente para relajarte y consentir tus sentidos 🍃\n\n',
            'Incluye exfoliacion corporal, envoltura nutritiva de chocolaterapia, masaje relajante, masaje craneal anti estres, aceites esenciales, copa de vino y decoracion con petalos.\n\n',
            'Precios:\n',
            '- 1 persona: $1299\n',
            '- 2 personas: $1800'
        ].join(''),
        media: 'chocolaterapiaforher.jpeg'
    },
    'royal-skin': {
        text: [
            'Royal Skin es nuestra experiencia TOP, con tecnologia avanzada y activos regenerativos.\n\n',
            'Incluye limpieza facial premium con PDRN, HIFU 7D, TIC con activo PDRN, mascarilla PDRN, mascara LED, exfoliacion corporal, chocolaterapia, masaje relajante, aromaterapia, copa de vino y petalos.\n\n',
            'Precio:\n',
            '- 1 persona: $5199'
        ].join(''),
        media: 'membresiatop.jpeg'
    },
    'seda-effect': {
        text: [
            'Seda Effect ayuda a que la piel se sienta mas suave, uniforme y luminosa.\n\n',
            'Incluye dermaplaning, dermafacial, masaje relajante y aromaterapia.\n\n',
            'Precios:\n',
            '- 1 persona: $1299\n',
            '- 2 personas: $1800'
        ].join(''),
        media: 'dermafacial.jpeg'
    },
    'soft-harmony': {
        text: [
            'Soft Harmony es un ritual para descansar y soltar tension 🤍\n\n',
            'Incluye limpieza facial renovadora, masaje corporal relajante, aromaterapia y copa de vino.\n\n',
            'Precio:\n',
            '- 2 personas: $1499'
        ].join(''),
        media: 'facialandbodyrelax.jpeg'
    }
};

const hasServiceQuestionIntent = (message) => {
    const value = normalizeText(message);
    return [
        'precio', 'cuesta', 'costo', 'incluye', 'que incluye', 'informacion',
        'info', 'me interesa', 'quiero saber', 'hablame', 'cuentame'
    ].some((keyword) => value.includes(keyword));
}

const handleGuidedResponse = async (phoneNumber, message) => {
    const value = normalizeText(message);

    if(value.includes('horario') || value.includes('horarios')) {
        await Messages.sendTextMessage([
            'Nuestro horario de atencion es:\n',
            'Lunes a viernes de 10:00 am a 7:00 pm\n',
            'Sabados de 10:00 am a 4:00 pm\n',
            'Domingos cerrado.\n\n',
            'Si quieres agendar, comparteme servicio, dia, hora, nombre y numero de personas 📅'
        ].join(''), phoneNumber);
        return true;
    }

    const service = findService(message);
    if(service && hasServiceQuestionIntent(message)) {
        const detail = SERVICE_DETAILS[service.id];
        if(!detail) return false;

        await Messages.sendTextMessage(detail.text, phoneNumber);
        if(detail.media) await Messages.sendLocalMedia(detail.media, phoneNumber);
        return true;
    }

    return false;
}

module.exports = { handleGuidedResponse }
