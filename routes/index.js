const router = require('express').Router();
const { requireAuth, checkPermission } = require('../middleware/auth');

// --- 1. Public Routes ---
router.use(require('./webhookRoutes'));  // WhatsApp webhook
router.use(require('./authRoutes'));     // Login endpoints (login is public, me/logout are protected internally)
router.use(require('./superAdminRoutes')); // Super Admin endpoints (uses requireSuperAdmin internally)

// --- 2. Authentication Gate ---
router.use(requireAuth);

// --- 3. Module-based Authorization Checks ---
router.use('/api/chats', checkPermission('dashboard'));
router.use('/api/clients', checkPermission('clients'));
router.use('/api/services', (req, res, next) => {
    if (req.method === 'GET') {
        return next();
    }
    return checkPermission('services-admin')(req, res, next);
});
router.use('/api/service-categories', (req, res, next) => {
    if (req.method === 'GET') {
        return next();
    }
    return checkPermission('services-admin')(req, res, next);
});
router.use('/api/marketing', checkPermission('marketing'));
router.use('/api/tracking', checkPermission('tracking'));
router.use('/api/patient-tracking', checkPermission('patient-tracking'));
router.use('/api/calendar', checkPermission('calendar'));
router.use('/api/flow', checkPermission('flow-admin'));
router.use('/api/employees', (req, res, next) => {
    if (req.method === 'GET') {
        return next();
    }
    return checkPermission('user-admin')(req, res, next);
});

// --- 4. Mount Domain Routers ---
router.use(require('./dashboardRoutes'));
router.use(require('./servicesRoutes'));
router.use(require('./marketingRoutes'));
router.use(require('./trackingRoutes'));
router.use(require('./patientTrackingRoutes'));
router.use(require('./calendarRoutes'));
router.use(require('./flowRoutes'));
router.use(require('./employeeRoutes'));

module.exports = router;
