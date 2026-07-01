const crypto = require('crypto');
const getSupabase = require('../config/supabase');

/**
 * Hash a password using PBKDF2.
 * @param {string} password 
 * @returns {string} salt:hash format
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash.
 * @param {string} password 
 * @param {string} storedPassword 
 * @returns {boolean}
 */
function verifyPassword(password, storedPassword) {
    try {
        const [salt, hash] = storedPassword.split(':');
        if (!salt || !hash) return false;
        const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
        return hash === verifyHash;
    } catch (err) {
        console.error('Error verifying password:', err);
        return false;
    }
}

/**
 * Parse cookies manually from request headers.
 * @param {object} req 
 * @returns {object} key-value cookies
 */
function parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
        rc.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    }
    return list;
}

/**
 * Middleware to require user authentication (with Tenant verification).
 */
async function requireAuth(req, res, next) {
    const cookies = parseCookies(req);
    const token = cookies.session_token;

    if (!token) {
        if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'No autenticado. Por favor, inicia sesión.' });
        }
        return res.redirect('/login');
    }

    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase client not initialized');
        return res.status(500).json({ error: 'Error de configuración del servidor' });
    }

    try {
        // Query session joining with employee details and company details
        const { data: sessionData, error } = await supabase
            .from('sessions')
            .select(`
                token, 
                expires_at, 
                employees(
                    id, 
                    username, 
                    name, 
                    role, 
                    permissions, 
                    active, 
                    company_id,
                    companies(id, name, slug, active)
                )
            `)
            .eq('token', token)
            .single();

        if (error || !sessionData) {
            res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
            if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Sesión inválida o expirada.' });
            }
            return res.redirect('/login');
        }

        // Check if session has expired
        const now = new Date();
        const expiresAt = new Date(sessionData.expires_at);
        if (now > expiresAt) {
            await supabase.from('sessions').delete().eq('token', token);
            res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
            if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Sesión expirada.' });
            }
            return res.redirect('/login');
        }

        const employee = sessionData.employees;
        if (!employee || !employee.active) {
            if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'Usuario inactivo o no existe.' });
            }
            return res.redirect('/login');
        }

        // Verification of Client Tenant Company (Only for standard admin/employee)
        if (employee.company_id) {
            const company = employee.companies;
            if (!company || !company.active) {
                // Clear session if company is suspended/inactive
                await supabase.from('sessions').delete().eq('token', token);
                res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
                
                if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
                    return res.status(403).json({ error: 'Acceso denegado. La empresa a la que perteneces está inactiva.' });
                }
                return res.redirect('/login?error=company_inactive');
            }
        }

        // Attach user info to request
        req.user = employee;
        req.sessionToken = token;
        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(500).json({ error: 'Error interno en la validación de sesión' });
    }
}

/**
 * Middleware to require Super Admin role.
 */
async function requireSuperAdmin(req, res, next) {
    const cookies = parseCookies(req);
    const token = cookies.session_token;

    if (!token) {
        if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'No autenticado. Inicia sesión como Super Administrador.' });
        }
        return res.redirect('/superadmin/login');
    }

    const supabase = getSupabase();
    if (!supabase) {
        return res.status(500).json({ error: 'Error de configuración del servidor' });
    }

    try {
        const { data: sessionData, error } = await supabase
            .from('sessions')
            .select('token, expires_at, employees(id, username, name, role, active, company_id)')
            .eq('token', token)
            .single();

        if (error || !sessionData) {
            res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
            if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Sesión inválida.' });
            }
            return res.redirect('/superadmin/login');
        }

        const now = new Date();
        if (now > new Date(sessionData.expires_at)) {
            await supabase.from('sessions').delete().eq('token', token);
            res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
            if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Sesión expirada.' });
            }
            return res.redirect('/superadmin/login');
        }

        const employee = sessionData.employees;
        // Verify Superadmin profile properties
        if (!employee || !employee.active || employee.role !== 'superadmin' || employee.company_id !== null) {
            if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'Acceso denegado. Se requieren privilegios de Super Administrador.' });
            }
            return res.redirect('/login');
        }

        req.user = employee;
        req.sessionToken = token;
        next();
    } catch (err) {
        console.error('SuperAdmin auth middleware error:', err);
        return res.status(500).json({ error: 'Error interno de validación' });
    }
}

/**
 * Middleware to check fine-grained module access for API routes.
 */
function checkPermission(moduleKey) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado.' });
        }
        // Super Admin has system dashboard access, but lets keep it isolated
        if (req.user.role === 'superadmin') {
            return next();
        }
        if (req.user.role === 'admin') {
            return next();
        }
        if (req.user.permissions && req.user.permissions.includes(moduleKey)) {
            return next();
        }
        return res.status(403).json({ error: 'Acceso denegado. No tienes permisos para este servicio.' });
    };
}

/**
 * Middleware to check module access for serving static files (pages).
 */
function checkPermissionStatic(moduleKey) {
    return (req, res, next) => {
        if (!req.user) {
            return res.redirect('/login');
        }
        if (req.user.role === 'superadmin') {
            return next();
        }
        if (req.user.role === 'admin') {
            return next();
        }
        if (req.user.permissions && req.user.permissions.includes(moduleKey)) {
            return next();
        }
        return res.redirect('/home?error=denied');
    };
}

module.exports = {
    hashPassword,
    verifyPassword,
    requireAuth,
    requireSuperAdmin,
    checkPermission,
    checkPermissionStatic
};
