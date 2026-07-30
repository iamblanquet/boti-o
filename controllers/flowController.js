const { DEFAULT_MESSAGES, refreshSystemMessages } = require('../utils/systemMessageLoader');
const Configuration = require('../models/configuration/repository');
const { validateConversationFlow, validateSystemMessages } = require('../models/configuration/validators');

const getFlow = async (req, res) => {
  try {
    return res.status(200).json(await Configuration.getConversationFlow());
  } catch (error) {
    console.error('Error leyendo el flujo de configuracion:', error);
    return res.status(500).json({ error: 'No se pudo leer el flujo conversacional.' });
  }
};

const updateFlow = async (req, res) => {
  try {
    validateConversationFlow(req.body);
    await Configuration.saveConversationFlow(req.body, req.user?.id || null);
    return res.status(200).json({ message: 'Flujo conversacional guardado correctamente.' });
  } catch (error) {
    if(error.code === 'BOT_CONFIGURATION_UNAVAILABLE') {
      return res.status(503).json({ error: 'No se pudo guardar la configuracion. Intenta nuevamente.' });
    }
    if(error.message && /flujo|elemento|palabras clave|respuesta/i.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error guardando el flujo de configuracion:', error);
    return res.status(500).json({ error: 'No se pudo guardar el flujo conversacional.' });
  }
};

const getSystemMessages = async (req, res) => {
  try {
    const custom = await Configuration.getSystemMessageOverrides();
    return res.status(200).json({ ...DEFAULT_MESSAGES, ...custom });
  } catch (error) {
    console.error('Error leyendo mensajes del sistema:', error);
    return res.status(500).json({ error: 'No se pudieron obtener los mensajes del sistema.' });
  }
};

const updateSystemMessages = async (req, res) => {
  try {
    validateSystemMessages(req.body || {}, DEFAULT_MESSAGES);
    await Configuration.saveSystemMessageOverrides(req.body || {}, req.user?.id || null);
    await refreshSystemMessages();
    return res.status(200).json({ message: 'Mensajes del sistema actualizados correctamente.' });
  } catch (error) {
    if(error.code === 'BOT_CONFIGURATION_UNAVAILABLE') {
      return res.status(503).json({ error: 'No se pudo guardar la configuracion. Intenta nuevamente.' });
    }
    if(error.message && /mensajes|campo|variable/i.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error guardando mensajes del sistema:', error);
    return res.status(500).json({ error: 'No se pudieron guardar los mensajes del sistema.' });
  }
};

module.exports = { getFlow, updateFlow, getSystemMessages, updateSystemMessages };
