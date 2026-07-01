const fs = require('fs').promises;
const path = require('path');
const RESPONSES_FILE = path.join(__dirname, '../helpers/thessaResponses.json');
const SYSTEM_MESSAGES_FILE = path.join(__dirname, '../helpers/systemMessages.json');
const { DEFAULT_MESSAGES } = require('../utils/systemMessageLoader');

// Helper to check validation rules
const validateFlowSchema = (flowArray) => {
  if (!Array.isArray(flowArray)) {
    throw new Error('El flujo conversacional debe ser un arreglo.');
  }

  for (let i = 0; i < flowArray.length; i++) {
    const item = flowArray[i];
    if (item.step === undefined) {
      throw new Error(`El elemento en el índice ${i} no tiene definido el campo 'step'.`);
    }
    if (!Array.isArray(item.keywords)) {
      throw new Error(`El elemento en el índice ${i} debe tener un arreglo de 'keywords'.`);
    }
    if (item.keywords.some(k => typeof k !== 'string')) {
      throw new Error(`Las palabras clave del elemento en el índice ${i} deben ser cadenas de texto.`);
    }
    if (item.response && !Array.isArray(item.response)) {
      throw new Error(`La respuesta del elemento en el índice ${i} debe ser un arreglo de líneas.`);
    }
  }
  return true;
};

const getFlow = async (req, res) => {
  try {
    const data = await fs.readFile(RESPONSES_FILE, 'utf8');
    const flow = JSON.parse(data);
    return res.status(200).json(flow);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(200).json([]);
    }
    console.error('Error leyendo el archivo de flujo:', error);
    return res.status(500).json({ error: 'No se pudo leer el archivo de flujo.' });
  }
};

const updateFlow = async (req, res) => {
  try {
    const flowArray = req.body;
    
    // Validate schema
    try {
      validateFlowSchema(flowArray);
    } catch (valError) {
      return res.status(400).json({ error: valError.message });
    }

    // Direct write to target file (avoiding Windows lock issues on rename)
    const cleanJSON = JSON.stringify(flowArray, null, 2);
    await fs.writeFile(RESPONSES_FILE, cleanJSON, 'utf8');

    return res.status(200).json({ message: 'Flujo conversacional guardado correctamente.' });
  } catch (error) {
    console.error('Error guardando el archivo de flujo:', error);
    return res.status(500).json({ error: 'No se pudo guardar el archivo de flujo.' });
  }
};

const getSystemMessages = async (req, res) => {
  try {
    let custom = {};
    try {
      const data = await fs.readFile(SYSTEM_MESSAGES_FILE, 'utf8');
      custom = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
    return res.status(200).json({ ...DEFAULT_MESSAGES, ...custom });
  } catch (error) {
    console.error('Error leyendo mensajes del sistema:', error);
    return res.status(500).json({ error: 'No se pudieron obtener los mensajes del sistema.' });
  }
};

const updateSystemMessages = async (req, res) => {
  const FIELD_NAMES_ES = {
    service_category_intro: "Mensaje de Selección de Categoría",
    service_select_intro: "Mensaje de Selección de Servicio (Pág. 1)",
    service_select_more: "Mensaje de Selección de Servicio (Pág. 2+)",
    date_select_intro: "Pregunta para elegir Día",
    date_no_availability: "Mensaje: Sin disponibilidad esta semana",
    time_select_intro: "Pregunta para elegir Horario",
    time_no_availability: "Mensaje: Sin horarios para el día",
    people_select_intro: "Pregunta: Cantidad de personas",
    name_ask_intro: "Pregunta: Nombre completo del cliente",
    slot_out_of_hours: "Mensaje: Horario fuera de atención",
    slot_not_available: "Mensaje: Horario ya ocupado",
    slot_expired: "Mensaje: Horario que ya pasó",
    reschedule_success: "Mensaje: Reprogramación Exitosa",
    booking_success: "Mensaje: Reservación / Agendamiento Exitoso",
    catalog_category_intro: "Mensaje de Selección de Categoría (Menú de Servicios)",
    catalog_service_intro: "Mensaje de Listado de Servicios (Pág. 1)",
    catalog_service_more: "Mensaje de Listado de Servicios (Pág. 2+)",
    catalog_not_found: "Mensaje: Servicio no encontrado en catálogo",
    closing_appointment_invite: "Invitación final a Cita (CTA de Cierre)",
    promotions_empty: "Mensaje: Sin promociones activas registradas",
    promo_birthday_invitation: "Flujo cumpleanos: Invitacion",
    promo_birthday_ask: "Flujo cumpleanos: Pregunta de cumpleanos",
    promo_birthday_invalid: "Flujo cumpleanos: Cumpleanos invalido",
    promo_email_ask: "Flujo cumpleanos: Pregunta de correo",
    promo_email_invalid: "Flujo cumpleanos: Correo invalido",
    promo_registration_decline: "Flujo cumpleanos: Respuesta al rechazar",
    promo_registration_success: "Flujo cumpleanos: Confirmacion final"
  };

  try {
    const customMessages = req.body || {};
    
    // Validate placeholders and types
    for (const key of Object.keys(DEFAULT_MESSAGES)) {
      if (customMessages[key] !== undefined) {
        if (typeof customMessages[key] !== 'string') {
          return res.status(400).json({ error: `El campo ${key} debe ser una cadena de texto.` });
        }

        // Extract required placeholders from DEFAULT_MESSAGES
        const defaultText = DEFAULT_MESSAGES[key];
        const requiredMatches = defaultText.match(/{{[a-zA-Z0-9_]+}}/g);
        if (requiredMatches) {
          const uniqueRequired = Array.from(new Set(requiredMatches));
          for (const placeholder of uniqueRequired) {
            if (!customMessages[key].includes(placeholder)) {
              const friendlyName = FIELD_NAMES_ES[key] || key;
              return res.status(400).json({
                error: `El campo "${friendlyName}" debe contener la variable obligatoria ${placeholder} para evitar fallas en el flujo del bot.`
              });
            }
          }
        }
      }
    }

    const cleanJSON = JSON.stringify(customMessages, null, 2);
    await fs.writeFile(SYSTEM_MESSAGES_FILE, cleanJSON, 'utf8');

    return res.status(200).json({ message: 'Mensajes del sistema actualizados correctamente.' });
  } catch (error) {
    console.error('Error guardando mensajes del sistema:', error);
    return res.status(500).json({ error: 'No se pudieron guardar los mensajes del sistema.' });
  }
};

module.exports = {
  getFlow,
  updateFlow,
  getSystemMessages,
  updateSystemMessages
};
