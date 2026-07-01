const test = require('node:test');
const assert = require('node:assert/strict');

test('assisted appointment flow metadata keeps selected service context', () => {
    const {
        buildAssistedFlowMetadata
    } = require('../models/assistedAppointmentFlow');

    const metadata = buildAssistedFlowMetadata({
        startedAt: '2026-06-22T12:00:00.000Z',
        service: {
            id: 'masaje-relajante',
            nombre: 'Masaje Relajante',
            categoria: 'Masajes',
            duracionMinutos: 50
        }
    });

    assert.equal(metadata.type, 'appointment');
    assert.equal(metadata.entryPoint, 'dashboard-service-offer');
    assert.deepEqual(metadata.service, {
        id: 'masaje-relajante',
        name: 'Masaje Relajante',
        category: 'Masajes',
        durationMinutes: 50
    });
});

test('dashboard starts assisted appointment flow with selected service id', async () => {
    const dashboardController = require('../controllers/dashboard');
    const AssistedAppointmentFlow = require('../models/assistedAppointmentFlow');
    const ChatStore = require('../models/chatStore');

    const originals = {
        startAppointmentFlow: AssistedAppointmentFlow.startAppointmentFlow,
        clearAlert: ChatStore.clearAlert,
        setAlert: ChatStore.setAlert,
        broadcastControl: ChatStore.broadcastControl
    };

    const calls = {
        startPayload: null,
        clearAlert: null,
        alert: null,
        broadcast: null
    };

    AssistedAppointmentFlow.startAppointmentFlow = async (payload) => {
        calls.startPayload = payload;
        return {
            control: {
                mode: 'assisted_flow',
                assistedFlow: {
                    type: 'appointment',
                    service: { id: payload.serviceId, name: 'Masaje Relajante' }
                }
            },
            service: {
                id: payload.serviceId,
                name: 'Masaje Relajante'
            }
        };
    };
    ChatStore.clearAlert = (phoneNumber, type) => {
        calls.clearAlert = { phoneNumber, type };
    };
    ChatStore.setAlert = (phoneNumber, alert) => {
        calls.alert = { phoneNumber, alert };
    };
    ChatStore.broadcastControl = (phoneNumber, control) => {
        calls.broadcast = { phoneNumber, control };
    };

    let statusCode = 200;
    let body = null;
    const req = {
        params: { phoneNumber: '5219990000000' },
        body: { serviceId: 'masaje-relajante' }
    };
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        }
    };

    try {
        await dashboardController.startAppointmentFlowFromDashboard(req, res);

        assert.equal(statusCode, 200);
        assert.deepEqual(calls.startPayload, {
            phoneNumber: '5219990000000',
            serviceId: 'masaje-relajante'
        });
        assert.equal(calls.clearAlert.type, 'human_control');
        assert.equal(calls.alert.alert.type, 'assisted_flow');
        assert.match(calls.alert.alert.message, /Masaje Relajante/);
        assert.equal(calls.broadcast.control.mode, 'assisted_flow');
        assert.equal(body.service.id, 'masaje-relajante');
    } finally {
        AssistedAppointmentFlow.startAppointmentFlow = originals.startAppointmentFlow;
        ChatStore.clearAlert = originals.clearAlert;
        ChatStore.setAlert = originals.setAlert;
        ChatStore.broadcastControl = originals.broadcastControl;
    }
});

test('dashboard client edit saves normalized birthday day and month', async () => {
    const dashboardController = require('../controllers/dashboard');
    const ClientesStorage = require('../models/clientes/almacenamiento');
    const ChatStore = require('../models/chatStore');

    const originals = {
        getClient: ClientesStorage.getClient,
        saveClient: ClientesStorage.saveClient,
        updateConversationName: ChatStore.updateConversationName
    };

    let savedClient = null;
    ClientesStorage.getClient = async () => ({
        phoneNumber: '5219990000000',
        name: 'Cliente',
        birthdayDay: null,
        birthdayMonth: null
    });
    ClientesStorage.saveClient = async (client) => {
        savedClient = client;
        return { ...client, birthday: '15/08' };
    };
    ChatStore.updateConversationName = () => {};

    let statusCode = 200;
    let body = null;
    const req = {
        params: { phoneNumber: '5219990000000' },
        body: { name: 'Cliente Editado', birthdayDay: '15', birthdayMonth: '8' }
    };
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        }
    };

    try {
        await dashboardController.updateClient(req, res);

        assert.equal(statusCode, 200);
        assert.equal(savedClient.birthdayDay, 15);
        assert.equal(savedClient.birthdayMonth, 8);
        assert.equal(body.client.birthday, '15/08');
    } finally {
        ClientesStorage.getClient = originals.getClient;
        ClientesStorage.saveClient = originals.saveClient;
        ChatStore.updateConversationName = originals.updateConversationName;
    }
});

test('dashboard client edit can clear birthday fields', async () => {
    const dashboardController = require('../controllers/dashboard');
    const ClientesStorage = require('../models/clientes/almacenamiento');

    const originals = {
        getClient: ClientesStorage.getClient,
        saveClient: ClientesStorage.saveClient
    };

    let savedClient = null;
    ClientesStorage.getClient = async () => ({
        phoneNumber: '5219990000000',
        name: 'Cliente',
        birthdayDay: 15,
        birthdayMonth: 8
    });
    ClientesStorage.saveClient = async (client) => {
        savedClient = client;
        return client;
    };

    let statusCode = 200;
    const req = {
        params: { phoneNumber: '5219990000000' },
        body: { birthdayDay: null, birthdayMonth: null }
    };
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            return payload;
        }
    };

    try {
        await dashboardController.updateClient(req, res);

        assert.equal(statusCode, 200);
        assert.equal(savedClient.birthdayDay, null);
        assert.equal(savedClient.birthdayMonth, null);
    } finally {
        ClientesStorage.getClient = originals.getClient;
        ClientesStorage.saveClient = originals.saveClient;
    }
});

test('dashboard client edit rejects invalid birthday', async () => {
    const dashboardController = require('../controllers/dashboard');
    const ClientesStorage = require('../models/clientes/almacenamiento');

    const originalGetClient = ClientesStorage.getClient;
    ClientesStorage.getClient = async () => ({ phoneNumber: '5219990000000', name: 'Cliente' });

    let statusCode = 200;
    let body = null;
    const req = {
        params: { phoneNumber: '5219990000000' },
        body: { birthdayDay: 31, birthdayMonth: 2 }
    };
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        }
    };

    try {
        await dashboardController.updateClient(req, res);

        assert.equal(statusCode, 400);
        assert.match(body.error, /Cumpleanos invalido/);
    } finally {
        ClientesStorage.getClient = originalGetClient;
    }
});
