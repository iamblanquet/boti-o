const { getMessage } = require('../utils/systemMessageLoader');

const formatPrice = (price) => {
    if(price === null || price === undefined || Number.isNaN(Number(price))) return null;
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0
    }).format(Number(price));
}

const formatPeoplePrices = (service) => {
    const prices = Array.isArray(service?.preciosPersonas) ? service.preciosPersonas : [];
    if(!prices.length) return formatPrice(service?.precio);

    const hasSpecialPeoplePrices = prices.some((item) => item.exclusivo)
        || new Set(prices.map((item) => Number(item.precio))).size > 1;
    if(!hasSpecialPeoplePrices) return formatPrice(service?.precio ?? prices[0]?.precio);

    return prices
        .map((item) => {
            const label = item.personas === 1 ? '1 persona' : `${item.personas} personas`;
            const price = formatPrice(item.precio);
            const note = item.exclusivo ? ' (exclusivo)' : '';
            return price ? `${label}: ${price}${note}` : null;
        })
        .filter(Boolean)
        .join(' / ');
}

const formatDuration = (minutes) => {
    if(!minutes) return null;
    return `${minutes} minutos`;
}

const formatInvestmentLabel = (price) => {
    if(!price) return null;
    const value = String(price);
    if(value.startsWith('1 persona:')) return `Inversion para ${value}.`;
    return `Inversion: ${value}.`;
}

const warmServiceDescription = (service) => {
    const description = String(service.descripcion || '').trim();
    if(description) return description;

    return 'es una opcion pensada para acompanar tu bienestar con una experiencia cuidada, profesional y personalizada.';
}

const closingAppointmentInvite = () => getMessage('closing_appointment_invite');

const serviceExact = (service, requestedField = 'general') => {
    const price = formatPeoplePrices(service);
    const duration = formatDuration(service.duracionMinutos);

    if(requestedField === 'precio' && price && duration) {
        return [
            `Con gusto. ${service.nombre} tiene una duracion aproximada de ${duration}.`,
            formatInvestmentLabel(price),
            '',
            closingAppointmentInvite()
        ].filter((part) => part !== null).join('\n');
    }

    if(requestedField === 'precio' && price) {
        return [
            `Claro, con gusto. Para ${service.nombre}, la inversion es: ${price}.`,
            '',
            closingAppointmentInvite()
        ].join('\n');
    }

    if(requestedField === 'duracion' && duration) {
        return `${service.nombre} toma aproximadamente ${duration}. Si te sirve, tambien puedo compartirte el precio o revisar disponibilidad para ti.`;
    }

    if(requestedField === 'beneficios' && service.beneficios?.length) {
        const benefits = service.beneficios.slice(0, 3).join(', ');
        return [
            `Te cuento, ${service.nombre} puede ayudarte especialmente con ${benefits}.`,
            'La idea es cuidar la zona con una atencion profesional y elegir el tratamiento segun lo que tu piel necesita.',
            '',
            closingAppointmentInvite()
        ].join('\n');
    }

    if(requestedField === 'productos' && service.productos?.length) {
        return [
            `Para ${service.nombre} utilizamos: ${service.productos.join(', ')}.`,
            'Si tienes alguna alergia, sensibilidad o duda sobre un producto, cuéntanoslo antes de tu cita para orientarte mejor.',
            '',
            closingAppointmentInvite()
        ].join('\n');
    }

    const parts = [
        `Te cuento, ${service.nombre}: es una opcion pensada para darte un resultado cuidado, comodo y profesional.`,
        warmServiceDescription(service)
    ];
    if(duration) parts.push(`Duracion aproximada: ${duration}.`);
    if(price) parts.push(formatInvestmentLabel(price));
    parts.push(closingAppointmentInvite());
    return parts.join('\n');
}







const faq = (answer) => answer;

const promotions = (items) => {
    if(!items.length) return getMessage('promotions_empty');

    const lines = items.slice(0, 3).map((promo) => {
        const service = promo.servicioNombre ? ` (${promo.servicioNombre})` : '';
        return `- ${promo.titulo}${service}: ${promo.descripcion}`;
    });

    return ['Tenemos estas promociones activas:', ...lines, 'Te gustaria conocer algun precio o revisar disponibilidad?'].join('\n');
}



module.exports = {
    formatPrice,
    formatPeoplePrices,
    formatDuration,
    serviceExact,

    faq,
    promotions,

};
