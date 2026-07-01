const fs = require('fs');
const path = require('path');
const { isValidStage } = require('./stages');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUP_FILE = path.join(BACKUP_DIR, 'patient_pipeline_overrides.json');

const normalizePhoneNumber = (phoneNumber) => String(phoneNumber || '')
    .replace(/@c\.us$/i, '')
    .replace(/\D/g, '');

const readOverrides = () => {
    try {
        if (!fs.existsSync(BACKUP_FILE)) return {};
        return JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8')) || {};
    } catch (error) {
        console.log('No se pudo leer respaldo local de seguimiento.', error.message);
        return {};
    }
};

const writeOverrides = (overrides) => {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(BACKUP_FILE, JSON.stringify(overrides, null, 2));
    } catch (error) {
        console.log('No se pudo guardar respaldo local de seguimiento.', error.message);
    }
};

const listOverrides = async () => readOverrides();

const getOverride = async (phoneNumber) => (
    readOverrides()[normalizePhoneNumber(phoneNumber)] || null
);

const saveManualStage = async (phoneNumber, stage) => {
    const cleanPhone = normalizePhoneNumber(phoneNumber);
    if (!cleanPhone || !isValidStage(stage)) return null;

    const overrides = readOverrides();
    overrides[cleanPhone] = {
        ...(overrides[cleanPhone] || {}),
        phoneNumber: cleanPhone,
        manualStage: stage,
        updatedAt: new Date().toISOString()
    };
    writeOverrides(overrides);
    return overrides[cleanPhone];
};

const clearManualStage = async (phoneNumber) => {
    const cleanPhone = normalizePhoneNumber(phoneNumber);
    if (!cleanPhone) return null;

    const overrides = readOverrides();
    const previous = overrides[cleanPhone] || { phoneNumber: cleanPhone };
    overrides[cleanPhone] = {
        ...previous,
        manualStage: null,
        updatedAt: new Date().toISOString()
    };
    writeOverrides(overrides);
    return overrides[cleanPhone];
};

module.exports = {
    listOverrides,
    getOverride,
    saveManualStage,
    clearManualStage,
    normalizePhoneNumber
};
