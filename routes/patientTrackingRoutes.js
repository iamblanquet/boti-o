const router = require('express').Router();
const patientTrackingController = require('../controllers/patientTrackingController');

router.get('/api/patient-tracking/board', patientTrackingController.getBoard);
router.post('/api/patient-tracking/:phoneNumber/stage', patientTrackingController.updateManualStage);
router.post('/api/patient-tracking/:phoneNumber/auto', patientTrackingController.clearManualStage);

module.exports = router;
