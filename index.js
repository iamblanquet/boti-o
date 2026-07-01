const dotenv = require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const apiRouter = require('./routes/index');
const { startAppointmentReminders } = require('./models/citas/recordatorios');
const { startServiceFollowupReminders } = require('./models/serviceFollowup');

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(cors());
const { requireAuth, requireSuperAdmin, checkPermissionStatic } = require('./middleware/auth');

app.use('/mediaFiles', express.static(__dirname + '/mediaFiles'));
app.use('/tailwind.css', express.static(__dirname + '/public/tailwind.css'));
app.use('/global.css', express.static(__dirname + '/public/global.css'));
app.use('/components', express.static(__dirname + '/public/components'));
app.use('/login', express.static(__dirname + '/public/login'));
app.use('/superadmin/login', express.static(__dirname + '/public/superadmin/login'));
app.use('/superadmin/dashboard', requireSuperAdmin, express.static(__dirname + '/public/superadmin/dashboard'));

// --- Protected Views ---
app.use('/home', requireAuth, express.static(__dirname + '/public/home'));
app.use('/dashboard', requireAuth, checkPermissionStatic('dashboard'), express.static(__dirname + '/public/dashboard'));
app.use('/services-admin', requireAuth, checkPermissionStatic('services-admin'), express.static(__dirname + '/public/services-admin'));
app.use('/marketing', requireAuth, checkPermissionStatic('marketing'), express.static(__dirname + '/public/marketing'));
app.use('/tracking', requireAuth, checkPermissionStatic('tracking'), express.static(__dirname + '/public/tracking'));
app.use('/patient-tracking', requireAuth, checkPermissionStatic('patient-tracking'), express.static(__dirname + '/public/patient-tracking'));
app.use('/calendar', requireAuth, checkPermissionStatic('calendar'), express.static(__dirname + '/public/calendar'));
app.use('/clients', requireAuth, checkPermissionStatic('clients'), express.static(__dirname + '/public/clients'));
app.use('/flow-admin', requireAuth, checkPermissionStatic('flow-admin'), express.static(__dirname + '/public/flow-admin'));
app.use('/user-admin', requireAuth, checkPermissionStatic('user-admin'), express.static(__dirname + '/public/user-admin'));

app.get('/', (req, res) => res.redirect('/home'));
app.use(apiRouter);

const server = http.Server(app);

server.listen(port, ()=> {
    console.log(`Servidor listo en el puerto ${port}`);
    startAppointmentReminders();
    startServiceFollowupReminders();
})
