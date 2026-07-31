const validateConversationFlow = (value) => {
    if(!Array.isArray(value)) throw new Error('El flujo conversacional debe ser un arreglo.');

    value.forEach((item, index) => {
        if(!item || typeof item !== 'object') throw new Error(`El elemento en el indice ${index} no es valido.`);
        if(item.step === undefined) throw new Error(`El elemento en el indice ${index} no tiene definido el campo step.`);
        if(!Array.isArray(item.keywords) || item.keywords.some((keyword) => typeof keyword !== 'string')) {
            throw new Error(`El elemento en el indice ${index} debe tener palabras clave validas.`);
        }
        if(item.response !== undefined && !Array.isArray(item.response)) {
            throw new Error(`El elemento en el indice ${index} debe tener una respuesta en formato de arreglo.`);
        }
    });

    return value;
};

const validateSystemMessages = (value, defaults = {}) => {
    if(!value || Array.isArray(value) || typeof value !== 'object') {
        throw new Error('Los mensajes del sistema deben ser un objeto.');
    }

    Object.entries(value).forEach(([key, message]) => {
        if(typeof message !== 'string') throw new Error(`El campo ${key} debe ser una cadena de texto.`);
        if(['welcome_first_time', 'welcome_returning'].includes(key) && !message.trim()) {
            throw new Error(`El campo ${key} no puede estar vacio.`);
        }
        const required = ['welcome_first_time', 'welcome_returning'].includes(key)
            ? []
            : String(defaults[key] || '').match(/{{[a-zA-Z0-9_]+}}/g) || [];
        required.forEach((placeholder) => {
            if(!message.includes(placeholder)) {
                throw new Error(`El campo ${key} debe contener la variable obligatoria ${placeholder}.`);
            }
        });
    });

    return value;
};

module.exports = { validateConversationFlow, validateSystemMessages };
