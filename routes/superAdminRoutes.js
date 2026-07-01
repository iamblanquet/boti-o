const router = require('express').Router();
const superAdminController = require('../controllers/superAdminController');
const { requireSuperAdmin } = require('../middleware/auth');

router.get('/api/superadmin/companies', requireSuperAdmin, superAdminController.listCompanies);
router.post('/api/superadmin/companies', requireSuperAdmin, superAdminController.createCompany);
router.put('/api/superadmin/companies/:id', requireSuperAdmin, superAdminController.updateCompany);

// Routes for company admin credentials management
router.get('/api/superadmin/companies/:companyId/admin', requireSuperAdmin, superAdminController.getCompanyAdmin);
router.put('/api/superadmin/companies/:companyId/admin', requireSuperAdmin, superAdminController.updateCompanyAdmin);

module.exports = router;
