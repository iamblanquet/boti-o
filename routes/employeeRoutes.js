const router = require('express').Router();
const employeeController = require('../controllers/employeeController');
const { requireAuth } = require('../middleware/auth');

// Note: Top-level routing will enforce admin check, but we apply requireAuth here for safety
router.get('/api/employees', requireAuth, employeeController.listEmployees);
router.post('/api/employees', requireAuth, employeeController.createEmployee);
router.put('/api/employees/:id', requireAuth, employeeController.updateEmployee);
router.delete('/api/employees/:id', requireAuth, employeeController.deleteEmployee);

module.exports = router;
