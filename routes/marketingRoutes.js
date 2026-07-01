const router = require('express').Router();
const marketingController = require('../controllers/marketing');

router.get('/api/marketing/services', marketingController.getServices);
router.post('/api/marketing/audience', marketingController.getAudience);
router.post('/api/marketing/campaign', marketingController.sendCampaign);

module.exports = router;
