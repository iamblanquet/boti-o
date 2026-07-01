const crypto = require('crypto');
const getSupabase = require('../config/supabase');
const { verifyPassword } = require('../middleware/auth');

/**
 * Handle user login (tenant-aware).
 */
async function login(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(450).json({ error: 'Usuario y contraseña son requeridos.' });
    }

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Error del servidor: Supabase no inicializado.' });
    }

    try {
        // Fetch employee
        const { data: employee, error } = await supabase
            .from('employees')
            .select('*')
            .eq('username', username.trim().toLowerCase())
            .single();

        if (error || !employee) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

        if (!employee.active) {
            return res.status(403).json({ error: 'Esta cuenta ha sido desactivada. Contacta al administrador.' });
        }

        // Verify Company Active Status (only for non-superadmin users)
        if (employee.company_id) {
            const { data: company, error: companyErr } = await supabase
                .from('companies')
                .select('active')
                .eq('id', employee.company_id)
                .single();

            if (companyErr || !company || !company.active) {
                return res.status(403).json({ error: 'Acceso denegado. La empresa asociada está inactiva.' });
            }
        }

        // Verify password
        const isMatch = verifyPassword(password, employee.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
        }

        // Generate session token (UUID)
        const sessionToken = crypto.randomUUID();
        
        // Expiration time: 24 hours from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Insert session into database
        const { error: sessionError } = await supabase
            .from('sessions')
            .insert({
                token: sessionToken,
                employee_id: employee.id,
                expires_at: expiresAt.toISOString()
            });

        if (sessionError) {
            console.error('Error creating database session:', sessionError);
            return res.status(500).json({ error: 'Error al iniciar sesión en el servidor.' });
        }

        // Set HttpOnly cookie (valid for 24h)
        res.setHeader('Set-Cookie', `session_token=${sessionToken}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax`);

        // Return user profile
        return res.json({
            success: true,
            user: {
                id: employee.id,
                username: employee.username,
                name: employee.name,
                role: employee.role,
                company_id: employee.company_id,
                permissions: employee.permissions
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Error interno en el proceso de login.' });
    }
}

/**
 * Handle user logout.
 */
async function logout(req, res) {
    const token = req.sessionToken;
    const supabase = getSupabase();

    if (token && supabase) {
        try {
            await supabase
                .from('sessions')
                .delete()
                .eq('token', token);
        } catch (err) {
            console.error('Error deleting session during logout:', err);
        }
    }

    res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    return res.json({ success: true, message: 'Sesión cerrada exitosamente.' });
}

/**
 * Get current authenticated user details.
 */
function me(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'No autenticado.' });
    }
    return res.json({
        id: req.user.id,
        username: req.user.username,
        name: req.user.name,
        role: req.user.role,
        company_id: req.user.company_id,
        permissions: req.user.permissions
    });
}

module.exports = {
    login,
    logout,
    me
};
