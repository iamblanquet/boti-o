require('dotenv').config();
const { createAppointmentEvent } = require('../models/googleCalendar');

async function test() {
    try {
        console.log("Iniciando prueba de creación de cita...");
        const res = await createAppointmentEvent({
            appointment: {
                serviceName: "Servicio de Prueba Service Account",
                name: "Cliente de Prueba",
                phoneNumber: "5219811695579",
                people: 1,
                status: "pendiente de confirmacion"
            },
            start: new Date(Date.now() + 3600000), // En 1 hora
            end: new Date(Date.now() + 7200000)    // En 2 horas
        });
        console.log("¡Cita creada exitosamente!", res);
    } catch (e) {
        console.error("ERROR AL CREAR CITA:");
        console.error(e);
        if (e.response && e.response.data) {
            console.error("Detalles de respuesta de Google:", JSON.stringify(e.response.data, null, 2));
        }
    }
}

test();
