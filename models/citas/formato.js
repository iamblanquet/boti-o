const { combineDateTime } = require('../../utils/dateTime');

const getBusinessHoursText = () => 'lunes a viernes de 9:00 a.m. a 6:00 p.m. y sabados de 9:00 a.m. a 4:00 p.m.';
const getServiceLabel = (data) => data.serviceName || 'tu servicio';

const formatDayButtonTitle = (date) => {
    const label = new Intl.DateTimeFormat('es-MX', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    }).format(combineDateTime(date, '12:00'));

    return label.charAt(0).toUpperCase() + label.slice(1).replace('.', '');
}

module.exports = {
    getBusinessHoursText,
    getServiceLabel,
    formatDayButtonTitle
};
