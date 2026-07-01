const getSupabase = require('../config/supabase');
const { hashPassword } = require('../middleware/auth');

/**
 * List all companies with associated employee count.
 */
async function listCompanies(req, res) {
    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Supabase no inicializado.' });
    }

    try {
        const { data: companies, error } = await supabase
            .from('companies')
            .select('*, employees(count)')
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching companies:', error);
            return res.status(500).json({ error: 'Error al obtener la lista de empresas.' });
        }

        const formatted = companies.map(c => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            active: c.active,
            created_at: c.created_at,
            employee_count: c.employees && c.employees[0] ? c.employees[0].count : 0
        }));

        return res.json(formatted);
    } catch (err) {
        console.error('List companies error:', err);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
}

/**
 * Create a new tenant company and its primary administrator account.
 */
async function createCompany(req, res) {
    const { name, slug, adminUsername, adminPassword, adminName } = req.body;

    if (!name || !slug || !adminUsername || !adminPassword || !adminName) {
        return res.status(400).json({ error: 'Todos los campos son requeridos (Empresa, Slug, Nombre Administrador, Usuario y Contraseña).' });
    }

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Supabase no inicializado.' });
    }

    try {
        // 1. Insert Company
        const { data: company, error: companyError } = await supabase
            .from('companies')
            .insert({
                name: name.trim(),
                slug: slug.trim().toLowerCase(),
                active: true
            })
            .select()
            .single();

        if (companyError) {
            if (companyError.code === '23505') {
                return res.status(400).json({ error: 'El identificador (slug) de la empresa ya existe.' });
            }
            console.error('Error inserting company:', companyError);
            return res.status(500).json({ error: 'Error al registrar la empresa.' });
        }

        // 2. Insert Company Admin
        const hashedPassword = hashPassword(adminPassword);
        
        const defaultPermissions = [
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

        const adminEmployee = {
            company_id: company.id,
            username: adminUsername.trim().toLowerCase(),
            password_hash: hashedPassword,
            name: adminName.trim(),
            role: 'admin',
            permissions: defaultPermissions,
            active: true
        };

        const { data: admin, error: adminError } = await supabase
            .from('employees')
            .insert(adminEmployee)
            .select('id, username, name, role')
            .single();

        if (adminError) {
            console.error('Error inserting company admin, rolling back company creation:', adminError);
            await supabase.from('companies').delete().eq('id', company.id);

            if (adminError.code === '23505') {
                return res.status(400).json({ error: 'El nombre de usuario del administrador ya está registrado a nivel global.' });
            }
            return res.status(500).json({ error: 'Error al crear la cuenta del administrador principal.' });
        }

        return res.status(201).json({
            success: true,
            company,
            admin
        });
    } catch (err) {
        console.error('Create company error:', err);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
}

/**
 * Update company properties.
 */
async function updateCompany(req, res) {
    const { id } = req.params;
    const { name, active } = req.body;

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Supabase no inicializado.' });
    }

    try {
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (active !== undefined) updates.active = active;

        const { data: company, error } = await supabase
            .from('companies')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating company:', error);
            return res.status(500).json({ error: 'Error al actualizar la empresa.' });
        }

        // Force logout if company deactivated
        if (active === false) {
            const { data: emps, error: empError } = await supabase
                .from('employees')
                .select('id')
                .eq('company_id', id);

            if (!empError && emps && emps.length > 0) {
                const empIds = emps.map(e => e.id);
                await supabase
                    .from('sessions')
                    .delete()
                    .in('employee_id', empIds);
            }
        }

        return res.json(company);
    } catch (err) {
        console.error('Update company error:', err);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
}

/**
 * Get primary administrator for a company.
 */
async function getCompanyAdmin(req, res) {
    const { companyId } = req.params;
    console.log(`[Diagnostic] getCompanyAdmin llamado para companyId: ${companyId}`);
    
    const supabase = getSupabase();
    if (!supabase) {
        console.error('[Diagnostic] Supabase no está inicializado');
        return res.status(500).json({ error: 'Supabase no inicializado.' });
    }

    try {
        // Query employee with role 'admin' for this company
        const { data: admin, error } = await supabase
            .from('employees')
            .select('id, username, name, role, active, company_id')
            .eq('company_id', companyId)
            .eq('role', 'admin')
            .single();

        if (error) {
            console.error(`[Diagnostic] Error de Supabase al buscar admin principal para la empresa ${companyId}:`, error.message);
            return res.status(404).json({ error: 'Administrador principal no encontrado para esta empresa.' });
        }

        if (!admin) {
            console.warn(`[Diagnostic] No se encontró ningún usuario admin para la empresa ${companyId}`);
            return res.status(404).json({ error: 'Administrador principal no encontrado para esta empresa.' });
        }

        console.log('[Diagnostic] Administrador principal encontrado:', admin);
        return res.json(admin);
    } catch (err) {
        console.error('[Diagnostic] Excepción atrapada en getCompanyAdmin:', err);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
}

/**
 * Update primary administrator credentials.
 */
async function updateCompanyAdmin(req, res) {
    const { companyId } = req.params;
    const { name, username, password } = req.body;
    console.log(`[Diagnostic] updateCompanyAdmin llamado para la empresa: ${companyId}, datos:`, { name, username, hasPassword: !!password });

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Supabase no inicializado.' });
    }

    try {
        // Locate primary admin user
        const { data: admin, error: findError } = await supabase
            .from('employees')
            .select('*')
            .eq('company_id', companyId)
            .eq('role', 'admin')
            .single();

        if (findError || !admin) {
            console.error('[Diagnostic] No se encontró el admin principal en updateCompanyAdmin:', findError);
            return res.status(404).json({ error: 'Administrador principal no encontrado.' });
        }

        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (username !== undefined) updates.username = username.trim().toLowerCase();
        
        let passwordChanged = false;
        if (password && password.trim() !== '') {
            updates.password_hash = hashPassword(password);
            passwordChanged = true;
        }

        const { data: updatedAdmin, error } = await supabase
            .from('employees')
            .update(updates)
            .eq('id', admin.id)
            .select('id, username, name, role')
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'El nombre de usuario ya está registrado por otra cuenta.' });
            }
            console.error('[Diagnostic] Error al guardar datos del admin:', error);
            return res.status(500).json({ error: 'Error al actualizar credenciales del administrador.' });
        }

        // If password was updated, destroy any open sessions
        if (passwordChanged) {
            await supabase
                .from('sessions')
                .delete()
                .eq('employee_id', admin.id);
        }

        console.log('[Diagnostic] Administrador actualizado exitosamente');
        return res.json({ success: true, admin: updatedAdmin });
    } catch (err) {
        console.error('[Diagnostic] Excepción en updateCompanyAdmin:', err);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
}

module.exports = {
    listCompanies,
    createCompany,
    updateCompany,
    getCompanyAdmin,
    updateCompanyAdmin
};
