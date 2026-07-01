const Messages = require('./messages');
const { normalizeText } = require('../utils/configCitas');

const handleGuidedResponse = async (phoneNumber, message) => {
    const value = normalizeText(message);

    if(value.includes('horario') || value.includes('horarios')) {
        await Messages.sendTextMessage([
            'Con gusto. Nuestro horario de atencion es:',
            'Lunes a viernes de 9:00 am a 6:00 pm',
            'Sabados de 9:00 am a 4:00 pm',
            'Domingos cerrado.',
            '',
            'Si quieres agendar, toca Agendar cita y te muestro disponibilidad paso a paso.'
        ].join('\n'), phoneNumber);
        return true;
    }

    return false;
}

module.exports = { handleGuidedResponse };
