const router = require('express').Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Public route
router.post('/api/auth/login', authController.login);

// Protected routes
router.post('/api/auth/logout', requireAuth, authController.logout);
router.get('/api/auth/me', requireAuth, authController.me);

module.exports = router;
