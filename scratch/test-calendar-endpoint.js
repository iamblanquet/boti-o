require('dotenv').config();
const { getConfirmedAppointments } = require('../controllers/calendarController');

// Simular Express req/res
const req = {
    query: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 días atrás
        end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()    // 30 días adelante
    }
};

const res = {
    json: (data) => {
        console.log("Respuesta JSON exitosa:");
        console.log(JSON.stringify(data, null, 2));
    },
    status: (code) => ({
        json: (data) => {
            console.error(`Respuesta Error ${code}:`);
            console.error(JSON.stringify(data, null, 2));
        }
    })
};

async function run() {
    console.log("Llamando a getConfirmedAppointments...");
    await getConfirmedAppointments(req, res);
}

run();
