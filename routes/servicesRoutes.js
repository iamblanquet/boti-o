const router = require('express').Router();
const servicesAdminController = require('../controllers/servicesAdmin');

router.get('/api/services', servicesAdminController.listServices);
router.post('/api/services', servicesAdminController.createService);
router.post('/api/services/media', servicesAdminController.uploadServiceImage);
router.put('/api/services/:id', servicesAdminController.updateService);
router.delete('/api/services/:id', servicesAdminController.deleteService);
router.post('/api/service-categories', servicesAdminController.createCategory);
router.put('/api/service-categories/:id', servicesAdminController.updateCategory);
router.delete('/api/service-categories/:id', servicesAdminController.deleteCategory);

module.exports = router;
