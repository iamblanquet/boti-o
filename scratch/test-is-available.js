require('dotenv').config();
const { isAvailable } = require('../models/googleCalendar');

async function test() {
    try {
        console.log("Comprobando disponibilidad con Google Calendar...");
        const start = new Date(Date.now() + 3600000); // 1 hora en el futuro
        const end = new Date(Date.now() + 7200000);  // 2 horas en el futuro
        const res = await isAvailable(start, end);
        console.log("Resultado de disponibilidad:", res);
    } catch (e) {
        console.error("ERROR AL VERIFICAR DISPONIBILIDAD:");
        console.error(e);
        if (e.response && e.response.data) {
            console.error("Detalles de respuesta de Google:", JSON.stringify(e.response.data, null, 2));
        }
    }
}

test();
