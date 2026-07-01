// Script to seed the Super Admin and default Thessa Tenant
// Run with: node scripts/seedSuperAdmin.js

require('dotenv').config();
const getSupabase = require('../config/supabase');
const { hashPassword } = require('../middleware/auth');

async function seed() {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Error: No se pudo inicializar el cliente de Supabase.');
        process.exit(1);
    }

    console.log(`Iniciando semilla para el Super Administrador y Empresa por defecto...`);

    try {
        // 1. Insert/Upsert Super Admin Account (no company assigned)
        const superAdminUser = {
            username: 'superadmin',
            password_hash: hashPassword('SuperAdminThessa2026!'),
            name: 'Super Administrador',
            role: 'superadmin',
            permissions: [], // Super Admin only manages companies
            active: true
        };

        const { data: superAdminData, error: superAdminError } = await supabase
            .from('employees')
            .upsert(superAdminUser, { onConflict: 'username' })
            .select();

        if (superAdminError) {
            console.error('Error al insertar el Super Administrador:', superAdminError.message);
            console.log('¿Ya ejecutaste la migración SQL en el editor de Supabase para crear las tablas?');
            process.exit(1);
        }
        console.log('✔ Super Administrador creado con éxito.');

        // 2. Insert/Upsert Default Tenant Company: Thessa
        const defaultCompany = {
            name: 'Thessa',
            slug: 'thessa',
            active: true
        };

        const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .upsert(defaultCompany, { onConflict: 'slug' })
            .select();

        if (companyError) {
            console.error('Error al insertar la empresa por defecto (Thessa):', companyError.message);
            process.exit(1);
        }
        
        const companyId = companyData[0].id;
        console.log(`✔ Empresa de prueba "${defaultCompany.name}" registrada con ID: ${companyId}`);

        // 3. Insert/Upsert Thessa local Admin User
        const allModulePermissions = [
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

        const localAdminUser = {
            company_id: companyId,
            username: 'admin',
            password_hash: hashPassword('AdminThessa2026!'),
            name: 'Administrador Thessa',
            role: 'admin',
            permissions: allModulePermissions,
            active: true
        };

        const { error: localAdminError } = await supabase
            .from('employees')
            .upsert(localAdminUser, { onConflict: 'username' })
            .select();

        if (localAdminError) {
            console.error('Error al registrar el administrador local de Thessa:', localAdminError.message);
            process.exit(1);
        }
        console.log('✔ Administrador local de Thessa registrado con éxito.');

        console.log('\n======================================================');
        console.log('¡Siembra completada con éxito!');
        console.log('------------------------------------------------------');
        console.log('CREDENCIALES DE SUPER ADMINISTRADOR SISTEMA (GLOBAL):');
        console.log('Ruta Acceso: /superadmin/login');
        console.log('Usuario:     superadmin');
        console.log('Password:    SuperAdminThessa2026!');
        console.log('------------------------------------------------------');
        console.log('CREDENCIALES DE ADMINISTRADOR THESSA (INQUILINO):');
        console.log('Ruta Acceso: /login');
        console.log('Usuario:     admin');
        console.log('Password:    AdminThessa2026!');
        console.log('======================================================\n');
        process.exit(0);
    } catch (err) {
        console.error('Error de ejecución en el script de siembra multi-tenant:', err);
        process.exit(1);
    }
}

seed();
