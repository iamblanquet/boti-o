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
        
        console.log(`Listando TODOS los eventos del calendario: ${getCalendarId()}`);
        
        const response = await calendar.events.list({
            calendarId: getCalendarId(),
            maxResults: 100
        });
        
        console.log("Total events:", response.data.items ? response.data.items.length : 0);
        if (response.data.items && response.data.items.length > 0) {
            console.log("Event List summaries:", response.data.items.map(item => ({
                id: item.id,
                summary: item.summary,
                status: item.status,
                start: item.start
            })));
        }
    } catch (e) {
        console.error("ERROR:");
        console.error(e);
    }
}

test();
