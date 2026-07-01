const router = require('express').Router();
const dashboardController = require('../controllers/dashboard');

router.get('/api/chats', dashboardController.getConversations);
router.get('/api/chats/:phoneNumber/messages', dashboardController.getMessages);
router.post('/api/chats/:phoneNumber/messages', dashboardController.sendMessage);
router.post('/api/chats/:phoneNumber/reply-suggestion', dashboardController.generateReplySuggestion);
router.get('/api/chats/:phoneNumber/summary', dashboardController.getChatSummary);
router.post('/api/chats/:phoneNumber/summary/regenerate', dashboardController.regenerateChatSummary);
router.get('/api/chats/:phoneNumber/summary/detailed-context', dashboardController.getDetailedChatContext);
router.post('/api/chats/:phoneNumber/summary/detailed-context', dashboardController.generateDetailedChatContext);
router.get('/api/chats/:phoneNumber/control', dashboardController.getConversationControl);
router.post('/api/chats/:phoneNumber/control/take', dashboardController.takeConversationControl);
router.post('/api/chats/:phoneNumber/control/release', dashboardController.releaseConversationControl);
router.post('/api/chats/:phoneNumber/actions/start-appointment-flow', dashboardController.startAppointmentFlowFromDashboard);
router.get('/api/chats/:phoneNumber/appointments', dashboardController.getClientAppointments);
router.get('/api/chats/events', dashboardController.stream);

// Rutas del nuevo modulo de clientes
router.get('/api/clients', dashboardController.getClients);
router.get('/api/clients/insights', dashboardController.getClientInsights);
router.get('/api/clients/:phoneNumber', dashboardController.getClientDetails);
router.post('/api/clients/:phoneNumber', dashboardController.updateClient);
router.get('/api/clients/:phoneNumber/confirmed-appointments', dashboardController.getClientConfirmedAppointments);

module.exports = router;
