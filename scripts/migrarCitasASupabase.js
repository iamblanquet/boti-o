require('dotenv').config();

const fs = require('fs');
const path = require('path');
const getSupabase = require('../config/supabase');

const BACKUP_FILE = path.join(__dirname, '..', 'data', 'citas.json');
const LEGACY_BACKUP_FILE = path.join(__dirname, '..', 'data', 'appointments.json');

const getBackupFile = () => fs.existsSync(BACKUP_FILE) ? BACKUP_FILE : LEGACY_BACKUP_FILE;

const toDbAppointment = (appointment) => ({
    id: appointment.id,
    phone_number: appointment.phoneNumber,
    name: appointment.name || null,
    service_id: appointment.serviceId || null,
    service_name: appointment.serviceName,
    duration_minutes: appointment.durationMinutes || null,
    people: appointment.people || null,
    start_at: appointment.startAt,
    end_at: appointment.endAt,
    status: appointment.status || 'pendiente',
    event_id: appointment.eventId || null,
    confirmed_at: appointment.confirmedAt || null,
    reminders: appointment.reminders || {},
    metadata: {
        date: appointment.date,
        time: appointment.time,
        price: appointment.price,
        source: appointment.source
    }
});

const main = async () => {
    const supabase = getSupabase();
    if(!supabase) {
        throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
    }

    const backupFile = getBackupFile();
    if(!fs.existsSync(backupFile)) {
        console.log('No existe data/citas.json. No hay citas locales para migrar.');
        return;
    }

    const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    const appointments = Object.values(backup.appointments || {});
    if(!appointments.length) {
        console.log('No hay citas locales para migrar.');
        return;
    }

    const rows = appointments.map(toDbAppointment);
    const { error } = await supabase
        .from('appointments')
        .upsert(rows, { onConflict: 'id' });

    if(error) throw new Error(error.message);

    console.log(`Citas migradas a Supabase: ${rows.length}`);
}

main().catch((error) => {
    console.error('No se pudo migrar citas a Supabase:', error.message);
    process.exit(1);
});
