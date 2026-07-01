require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

const getCalendarId = () => process.env.GOOGLE_CALENDAR_ID || 'primary';

const getServiceAccountCreds = () => {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    }
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
        return JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
    }
    return null;
};

const getAuthClient = () => {
    const creds = getServiceAccountCreds();
    return new google.auth.JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });
};

async function test() {
    try {
        const calendar = google.calendar({ version: 'v3', auth: getAuthClient() });
        const eventId = 'l8grcvg6cfcro2eqah6vccgr68';
        console.log(`Buscando evento por ID: ${eventId} en calendario: ${getCalendarId()}`);
        const response = await calendar.events.get({
            calendarId: getCalendarId(),
            eventId
        });
        console.log("Evento encontrado:", response.data);
    } catch (e) {
        console.error("ERROR:");
        console.error(e.message);
    }
}

test();
