const router = require('express').Router();
const flowController = require('../controllers/flowController');

router.get('/api/flow', flowController.getFlow);
router.post('/api/flow', flowController.updateFlow);
router.get('/api/flow/system-messages', flowController.getSystemMessages);
router.post('/api/flow/system-messages', flowController.updateSystemMessages);

module.exports = router;
