// Script to seed the initial admin account in Supabase
// Run with: node scripts/seedAdmin.js

require('dotenv').config();
const getSupabase = require('../config/supabase');
const { hashPassword } = require('../middleware/auth');

async function seed() {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Error: No se pudo inicializar el cliente de Supabase. Revisa las variables de entorno en .env.');
        process.exit(1);
    }

    const defaultAdminUsername = 'admin';
    const defaultAdminPassword = 'AdminThessa2026!';
    const defaultAdminName = 'Administrador Thessa';

    console.log(`Iniciando semilla para el usuario de administración...`);

    const hashedPassword = hashPassword(defaultAdminPassword);
    
    // Full module permissions list
    const allPermissions = [
        'dashboard',
        'clients',
        'calendar',
        'marketing',
        'services-admin',
        'flow-admin',
        'tracking',
        'patient-tracking',
        'user-admin'
    ];

    const adminUser = {
        username: defaultAdminUsername,
        password_hash: hashedPassword,
        name: defaultAdminName,
        role: 'admin',
        permissions: allPermissions,
        active: true
    };

    try {
        // Upsert by username key
        const { data, error } = await supabase
            .from('employees')
            .upsert(adminUser, { onConflict: 'username' })
            .select();

        if (error) {
            console.error('Error al insertar el administrador en la base de datos:');
            console.error(error.message);
            console.log('\nIMPORTANTE: ¿Ya ejecutaste el script SQL en el editor de Supabase para crear la tabla employees?');
            process.exit(1);
        }

        console.log('\n¡Administrador sembrado con éxito!');
        console.log('------------------------------------');
        console.log(`Usuario:   ${defaultAdminUsername}`);
        console.log(`Password:  ${defaultAdminPassword}`);
        console.log(`Nombre:    ${defaultAdminName}`);
        console.log('------------------------------------');
        console.log('Por favor cambia la contraseña inmediatamente después del primer login.');
        process.exit(0);
    } catch (err) {
        console.error('Error de ejecución en el script de siembra:', err);
        process.exit(1);
    }
}

seed();
