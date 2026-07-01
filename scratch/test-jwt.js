const { google } = require('googleapis');
const fs = require('fs');

try {
    const creds = JSON.parse(fs.readFileSync('./src/json_calendar/thessabot-04a5ce7b39eb.json', 'utf8'));
    const auth = new google.auth.JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });

    console.log("Intentando autorizar cuenta de servicio...");
    auth.authorize((err, tokens) => {
        if (err) {
            console.error("Error al autorizar:", err);
        } else {
            console.log("¡Tokens obtenidos exitosamente!", tokens);
        }
    });
} catch (e) {
    console.error("Error en ejecución de script:", e);
}
