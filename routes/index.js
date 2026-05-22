const router = require('express').Router();
const messageController = require('../controllers/messages');
const dashboardController = require('../controllers/dashboard');

router.get('/bot/webhook', messageController.apiVerification);
router.post('/bot/webhook', messageController.messageInfo);
router.get('/api/chats', dashboardController.getConversations);
router.get('/api/chats/:phoneNumber/messages', dashboardController.getMessages);
router.post('/api/chats/:phoneNumber/messages', dashboardController.sendMessage);
router.get('/api/chats/events', dashboardController.stream);

module.exports = router;
