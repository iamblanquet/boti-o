const fs = require('fs');
const path = require('path');
const MESSAGES_FILE = path.join(__dirname, '../helpers/systemMessages.json');

const DEFAULT_MESSAGES = {
  // Citas (Appointment Booking)
  service_category_intro: "Claro, te ayudo a agendar. Primero elige la categoria que te interesa:",
  service_select_intro: "Perfecto. Ahora elige el servicio de {{category}} que te gustaria reservar:",
  service_select_more: "Te comparto mas opciones de {{category}}:",
  date_select_intro: "Va. Para {{service}} tengo estos proximos dias disponibles. Elige el que te quede mejor:",
  date_no_availability: "Esta semana no veo dias disponibles para {{service}}.\n\nAtendemos de {{hours}}.\n\nSi gustas, revisamos otra semana con el equipo.",
  time_select_intro: "Perfecto. Para {{day}} tengo estos horarios disponibles:",
  time_no_availability: "Ese dia no veo horarios disponibles para {{service}}.\n\nAtendemos de {{hours}}.\n\nElige otro dia y lo reviso con gusto.",
  people_select_intro: "Muy bien. Para cuantas personas seria la cita?",
  name_ask_intro: "Perfecto. A nombre de quien dejamos la cita? Comparteme nombre completo, por favor.",
  slot_out_of_hours: "Ese horario queda fuera de nuestra disponibilidad. Atendemos de {{hours}}. Te muestro opciones disponibles:",
  slot_not_available: "Ese horario ya no aparece disponible. Te comparto otros espacios para que elijas:",
  slot_expired: "Ese horario ya paso. Te muestro opciones disponibles para elegir otra hora.",
  reschedule_success: "Listo. Reprogramamos tu cita para {{datetime}}.",
  booking_success: "Listo. Apartamos tu cita de {{service}} para {{datetime}} a nombre de {{name}}.",
  
  // Catálogo (Services Catalog)
  catalog_category_intro: "Elige una categoria y te comparto los servicios disponibles:",
  catalog_service_intro: "Estos son los servicios de {{category}}. Elige uno y te comparto detalle, precio y foto si esta disponible:",
  catalog_service_more: "Te comparto mas opciones de {{category}}:",
  catalog_not_found: "No ubique ese servicio en el catalogo actual. Te muestro las categorias disponibles:",
  
  // Plantillas (Templates & Closing CTA)
  closing_appointment_invite: "Si te gustaria, puedo ayudarte a revisar un horario que se acomode bien a tu dia.",
  promotions_empty: "Por ahora no veo promociones activas registradas. Si quieres, te comparto precios o revisamos disponibilidad para una cita.",

  // Registro para promociones y cumpleanos
  promo_birthday_invitation: "Me gustaria invitarte a formar parte de nuestro club de beneficios. Registrate para recibir promociones exclusivas en tu cumpleanos y otras fechas especiales. Te gustaria registrarte?",
  promo_birthday_ask: "Excelente. Cuando es tu cumpleanos? Por favor escribe solo el dia y el mes, por ejemplo: 25 de diciembre o 25/12.",
  promo_birthday_invalid: "Por favor escribe tu cumpleanos indicando solo el dia y el mes. Ejemplo: 25 de diciembre o 25/12.",
  promo_email_ask: "Anotado. Ahora, por favor compartenos tu correo electronico:",
  promo_email_invalid: "Por favor, escribe un correo electronico valido. Ejemplo: usuario@correo.com",
  promo_registration_decline: "Sin problema. Si en algun momento cambias de opinion, puedes registrarte despues. Que tengas un excelente dia!",
  promo_registration_success: "Listo. Ya registramos tus datos para recibir nuestras promociones exclusivas. Muchas gracias!"
};

const getMessages = () => {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const custom = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
      return { ...DEFAULT_MESSAGES, ...custom };
    }
  } catch (e) {
    console.error('Error loading custom system messages:', e);
  }
  return DEFAULT_MESSAGES;
};

const getMessage = (key, interpolations = {}) => {
  const msgs = getMessages();
  let text = msgs[key] || DEFAULT_MESSAGES[key] || '';
  for (const [k, v] of Object.entries(interpolations)) {
    text = text.replace(new RegExp(`{{${k}}}`, 'g'), v);
  }
  return text;
};

module.exports = {
  DEFAULT_MESSAGES,
  getMessages,
  getMessage
};
