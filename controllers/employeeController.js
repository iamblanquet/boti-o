const getSupabase = require('../config/supabase');
const { hashPassword } = require('../middleware/auth');

/**
 * List all employees belonging to the logged-in user's company.
 */
async function listEmployees(req, res) {
    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Supabase no inicializado.' });
    }

    try {
        let query = supabase
            .from('employees')
            .select('id, username, name, role, permissions, active, company_id, created_at, updated_at')
            .order('name', { ascending: true });

        // Enforce tenant isolation: limit results to the user's company (unless superadmin)
        if (req.user.role !== 'superadmin') {
            if (!req.user.company_id) {
                return res.status(403).json({ error: 'Acceso denegado. Perfil de empresa inválido.' });
            }
            query = query.eq('company_id', req.user.company_id);
        }

        const { data: employees, error } = await query;

        if (error) {
            console.error('Error fetching employees:', error);
            return res.status(500).json({ error: 'Error al obtener la lista de empleados.' });
        }

        return res.json(employees);
    } catch (err) {
        console.error('List employees error:', err);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
}

/**
 * Create a new employee within the logged-in user's company.
 */
async function createEmployee(req, res) {
    const { username, password, name, role, permissions, active } = req.body;

    if (!username || !password || !name) {
        return res.status(400).json({ error: 'Nombre, usuario y contraseña son requeridos.' });
    }

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Supabase no inicializado.' });
    }

    // Tenant Check: company admins cannot create system superadmins
    if (req.user.role !== 'superadmin' && role === 'superadmin') {
        return res.status(403).json({ error: 'Operación no permitida.' });
    }

    try {
        const hashedPassword = hashPassword(password);
        const newEmployee = {
            company_id: req.user.role === 'superadmin' ? null : req.user.company_id, // Automatic tenant binding
            username: username.trim().toLowerCase(),
            password_hash: hashedPassword,
            name: name.trim(),
            role: role || 'employee',
            permissions: permissions || [],
            active: active !== undefined ? active : true
        };

        // If company admin, they must have a valid company_id
        if (req.user.role !== 'superadmin' && !newEmployee.company_id) {
            return res.status(400).json({ error: 'Se requiere una empresa vinculada.' });
        }

        const { data, error } = await supabase
            .from('employees')
            .insert(newEmployee)
            .select('id, username, name, role, permissions, active, company_id, created_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'El nombre de usuario ya está registrado a nivel global.' });
            }
            console.error('Error creating employee:', error);
            return res.status(500).json({ error: 'Error al registrar el empleado.' });
        }

        return res.status(201).json(data);
    } catch (err) {
        console.error('Create employee error:', err);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
}

/**
 * Update an employee within the logged-in user's company.
 */
async function updateEmployee(req, res) {
    const { id } = req.params;
    const { username, password, name, role, permissions, active } = req.body;

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Supabase no inicializado.' });
    }

    try {
        // Fetch current employee info
        const { data: current, error: findError } = await supabase
            .from('employees')
            .select('*')
            .eq('id', id)
            .single();

        if (findError || !current) {
            return res.status(404).json({ error: 'Empleado no encontrado.' });
        }

        // Tenant Isolation: Prevent editing users from other companies
        if (req.user.role !== 'superadmin' && current.company_id !== req.user.company_id) {
            return res.status(403).json({ error: 'Acceso denegado. El empleado pertenece a otro inquilino.' });
        }

        // Prevent deactivating or demoting the tenant admin user 'admin'
        if (current.username === 'admin') {
            if (active === false) {
                return res.status(400).json({ error: 'No se puede desactivar la cuenta del administrador principal.' });
            }
            if (role === 'employee') {
                return res.status(400).json({ error: 'No se puede degradar el rol del administrador principal.' });
            }
        }

        // Prevent self-deactivation or self-demotion
        if (req.user.id === id) {
            if (active === false) {
                return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
            }
            if (role === 'employee' && current.role === 'admin') {
                return res.status(400).json({ error: 'No puedes degradar tu propio rol de administrador.' });
            }
        }

        const updates = {
            name: name !== undefined ? name.trim() : current.name,
            role: role !== undefined ? role : current.role,
            permissions: permissions !== undefined ? permissions : current.permissions,
            active: active !== undefined ? active : current.active
        };

        if (username) {
            updates.username = username.trim().toLowerCase();
        }

        // Only update password if a new one was provided
        if (password && password.trim() !== '') {
            updates.password_hash = hashPassword(password);
        }

        const { data, error } = await supabase
            .from('employees')
            .update(updates)
            .eq('id', id)
            .select('id, username, name, role, permissions, active, company_id, updated_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'El nombre de usuario ya está registrado por otro empleado.' });
            }
            console.error('Error updating employee:', error);
            return res.status(500).json({ error: 'Error al actualizar el empleado.' });
        }

        // Force logout if account is deactivated
        if (active === false) {
            await supabase.from('sessions').delete().eq('employee_id', id);
        }

        return res.json(data);
    } catch (err) {
        console.error('Update employee error:', err);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
}

/**
 * Delete an employee within the logged-in user's company.
 */
async function deleteEmployee(req, res) {
    const { id } = req.params;

    if (req.user.id === id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    }

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Supabase no inicializado.' });
    }

    try {
        // Fetch employee first to check tenant and username
        const { data: employee, error: findError } = await supabase
            .from('employees')
            .select('company_id, username')
            .eq('id', id)
            .single();

        if (findError || !employee) {
            return res.status(404).json({ error: 'Empleado no encontrado.' });
        }

        // Prevent deleting the main tenant admin user
        if (employee.username === 'admin') {
            return res.status(403).json({ error: 'No se puede eliminar el administrador principal del tenant.' });
        }

        // Tenant Isolation: Prevent deleting users from other companies
        if (req.user.role !== 'superadmin' && employee.company_id !== req.user.company_id) {
            return res.status(403).json({ error: 'Acceso denegado. El empleado pertenece a otro inquilino.' });
        }

        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting employee:', error);
            return res.status(500).json({ error: 'Error al eliminar el empleado.' });
        }

        return res.json({ success: true, message: 'Empleado eliminado exitosamente.' });
    } catch (err) {
        console.error('Delete employee error:', err);
        return res.status(500).json({ error: 'Error interno en el servidor.' });
    }
}

module.exports = {
    listEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee
};
