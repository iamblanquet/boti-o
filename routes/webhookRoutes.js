const router = require('express').Router();
const messageController = require('../controllers/whatsappWebhookController');
const { verifyMetaWebhookSignature } = require('../middleware/webhookSecurity');

router.get('/bot/webhook', messageController.apiVerification);
router.post('/bot/webhook', verifyMetaWebhookSignature, messageController.messageInfo);

module.exports = router;
