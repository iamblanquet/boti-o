const router = require('express').Router();
const calendarController = require('../controllers/calendarController');

router.get('/api/calendar/confirmed-appointments', calendarController.getConfirmedAppointments);

module.exports = router;
