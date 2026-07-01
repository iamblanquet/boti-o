const StateManager = require('../conversationStateManager');
const ClientesStorage = require('../clientes/almacenamiento');
const Messages = require('../messages');
const { sendButtonMessage } = require('./mensajesWhatsapp');
const { getMessage } = require('../../utils/systemMessageLoader');

const INTENCION_PROMO = 'registro_promociones';

const MONTHS = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12
};

const DAYS_BY_MONTH = {
    1: 31,
    2: 29,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31
};

const normalizeInput = (text) => String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const isPromoAffirmative = (text) => {
    const normalized = normalizeInput(text);
    return ['si', 'sii', 'claro', 'ok', 'vale', 'optin_yes'].includes(normalized) ||
        /^(si|sii|claro|ok|vale)\b/.test(normalized);
};

const isPromoNegative = (text) => {
    const normalized = normalizeInput(text);
    return ['no', 'nop', 'despues', 'mas tarde', 'ahorita no', 'mejor no', 'no gracias', 'no por ahora', 'optin_no'].includes(normalized) ||
        /^(no|nop|despues|no gracias)\b/.test(normalized);
};

const isValidBirthday = (day, month) => (
    Number.isInteger(day) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= DAYS_BY_MONTH[month]
);

const parseBirthday = (text) => {
    const clean = normalizeInput(text);

    const numeric = clean.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*\d{2,4})?\b/);
    if (numeric) {
        const day = parseInt(numeric[1], 10);
        const month = parseInt(numeric[2], 10);
        return isValidBirthday(day, month) ? { day, month } : null;
    }

    const monthRegex = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\b`);
    const matchMonth = clean.match(monthRegex);
    const matchDay = clean.match(/\b(\d{1,2})\b/);
    if (matchMonth && matchDay) {
        const day = parseInt(matchDay[1], 10);
        const month = MONTHS[matchMonth[1]];
        return isValidBirthday(day, month) ? { day, month } : null;
    }

    return null;
};

const validateEmail = (text) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(text || '').trim());

const hasBirthday = (client) => Boolean(client?.birthdayDay && client?.birthdayMonth);

const sendInvitation = (phoneNumber) => sendButtonMessage(
    phoneNumber,
    getMessage('promo_birthday_invitation'),
    [
        { id: 'optin_yes', title: 'Si' },
        { id: 'optin_no', title: 'No' }
    ]
);

const askBirthday = (phoneNumber) => Messages.sendTextMessage(
    getMessage('promo_birthday_ask'),
    phoneNumber
);

const askEmail = (phoneNumber) => Messages.sendTextMessage(
    getMessage('promo_email_ask'),
    phoneNumber
);

const finishRegistration = async (phoneNumber, data) => {
    const existingClient = await ClientesStorage.getClient(phoneNumber) || {};
    await ClientesStorage.saveClient({
        ...existingClient,
        phoneNumber,
        birthdayDay: data.birthdayDay || existingClient.birthdayDay,
        birthdayMonth: data.birthdayMonth || existingClient.birthdayMonth,
        email: data.email || existingClient.email
    });

    await Messages.sendTextMessage(getMessage('promo_registration_success'), phoneNumber);
    await StateManager.clearState(phoneNumber);
    return true;
};

const iniciarSiAplica = async (phoneNumber) => {
    try {
        const client = await ClientesStorage.getClient(phoneNumber);

        if (client?.email && hasBirthday(client)) return false;

        await StateManager.saveState({
            phone: phoneNumber,
            intent: INTENCION_PROMO,
            step: 'invitacion',
            data: {
                email: client?.email || null,
                birthdayDay: client?.birthdayDay || null,
                birthdayMonth: client?.birthdayMonth || null
            }
        });

        await sendInvitation(phoneNumber);
        return true;
    } catch (error) {
        console.error('Error al iniciar flujo de registro de promociones:', error.message);
        return false;
    }
};

const continuar = async (phoneNumber, messageText) => {
    try {
        const activeState = await StateManager.getActiveState(phoneNumber);
        if (!activeState || activeState.intent !== INTENCION_PROMO) return false;

        const step = activeState.step;
        const data = activeState.data || {};

        if (step === 'invitacion') {
            if (isPromoAffirmative(messageText)) {
                if (!data.birthdayDay || !data.birthdayMonth) {
                    await StateManager.saveState({
                        phone: phoneNumber,
                        intent: INTENCION_PROMO,
                        step: 'cumpleanos',
                        data
                    });
                    await askBirthday(phoneNumber);
                } else if (!data.email) {
                    await StateManager.saveState({
                        phone: phoneNumber,
                        intent: INTENCION_PROMO,
                        step: 'email',
                        data
                    });
                    await askEmail(phoneNumber);
                } else {
                    await StateManager.clearState(phoneNumber);
                }
                return true;
            }

            if (isPromoNegative(messageText)) {
                await Messages.sendTextMessage(getMessage('promo_registration_decline'), phoneNumber);
                await StateManager.clearState(phoneNumber);
                return true;
            }

            await sendInvitation(phoneNumber);
            return true;
        }

        if (step === 'cumpleanos') {
            const birthday = parseBirthday(messageText);
            if (!birthday) {
                await Messages.sendTextMessage(getMessage('promo_birthday_invalid'), phoneNumber);
                return true;
            }

            data.birthdayDay = birthday.day;
            data.birthdayMonth = birthday.month;

            if (!data.email) {
                await StateManager.saveState({
                    phone: phoneNumber,
                    intent: INTENCION_PROMO,
                    step: 'email',
                    data
                });
                await askEmail(phoneNumber);
                return true;
            }

            return finishRegistration(phoneNumber, data);
        }

        if (step === 'email') {
            if (!validateEmail(messageText)) {
                await Messages.sendTextMessage(getMessage('promo_email_invalid'), phoneNumber);
                return true;
            }

            data.email = String(messageText || '').trim().toLowerCase();
            return finishRegistration(phoneNumber, data);
        }

        return false;
    } catch (error) {
        console.error('Error al continuar flujo de registro de promociones:', error.message);
        return false;
    }
};

module.exports = {
    iniciarSiAplica,
    continuar,
    parseBirthday
};
