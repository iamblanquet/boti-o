const router = require('express').Router();
const trackingController = require('../controllers/trackingController');

// Ruta corta de redirección
router.get('/l/:campaignId', trackingController.redirectCampaign);

// APIs administrativas
router.get('/api/tracking/config', (req, res) => {
    return res.json({
        botPhone: String(process.env.WHATSAPP_BOT_PHONE || '').replace(/\D/g, ''),
        publicBaseUrl: String(process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')
    });
});
router.get('/api/campaigns', trackingController.listCampaigns);
router.post('/api/campaigns', trackingController.createCampaign);
router.delete('/api/campaigns/:id', trackingController.deleteCampaign);

module.exports = router;
