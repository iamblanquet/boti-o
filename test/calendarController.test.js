const test = require('node:test');
const assert = require('node:assert/strict');

const loadCalendarController = ({ citasStorage, clientesStorage, googleCalendar }) => {
    const previousCacheDisabled = process.env.CALENDAR_AGENDA_CACHE_DISABLED;
    process.env.CALENDAR_AGENDA_CACHE_DISABLED = 'true';

    const controllerPath = require.resolve('../controllers/calendarController');
    const citasPath = require.resolve('../models/citas/almacenamiento');
    const clientesPath = require.resolve('../models/clientes/almacenamiento');
    const googlePath = require.resolve('../models/googleCalendar');
    const previous = {
        controller: require.cache[controllerPath],
        citas: require.cache[citasPath],
        clientes: require.cache[clientesPath],
        google: require.cache[googlePath]
    };

    delete require.cache[controllerPath];
    require.cache[citasPath] = {
        id: citasPath,
        filename: citasPath,
        loaded: true,
        exports: citasStorage
    };
    require.cache[clientesPath] = {
        id: clientesPath,
        filename: clientesPath,
        loaded: true,
        exports: clientesStorage
    };
    require.cache[googlePath] = {
        id: googlePath,
        filename: googlePath,
        loaded: true,
        exports: googleCalendar
    };

    const controller = require('../controllers/calendarController');

    return {
        controller,
        cleanup: () => {
            if(previousCacheDisabled === undefined) delete process.env.CALENDAR_AGENDA_CACHE_DISABLED;
            else process.env.CALENDAR_AGENDA_CACHE_DISABLED = previousCacheDisabled;

            delete require.cache[controllerPath];
            if(previous.controller) require.cache[controllerPath] = previous.controller;

            if(previous.citas) require.cache[citasPath] = previous.citas;
            else delete require.cache[citasPath];

            if(previous.clientes) require.cache[clientesPath] = previous.clientes;
            else delete require.cache[clientesPath];

            if(previous.google) require.cache[googlePath] = previous.google;
            else delete require.cache[googlePath];
        }
    };
};

const createResponse = () => {
    const result = { statusCode: 200, body: null };
    return {
        result,
        res: {
            status(code) {
                result.statusCode = code;
                return this;
            },
            json(payload) {
                result.body = payload;
                return this;
            }
        }
    };
};

test('calendar endpoint shows confirmed Google events even without local appointment match', async () => {
    const calls = { range: null, phones: null };
    const { controller, cleanup } = loadCalendarController({
        citasStorage: {
            listAppointmentsForRange: async (start, end) => {
                calls.range = { start, end };
                return [];
            }
        },
        clientesStorage: {
            getClientsByPhones: async (phones) => {
                calls.phones = phones;
                return [{ phoneNumber: '5219990000000', name: 'Cliente desde CRM' }];
            }
        },
        googleCalendar: {
            isCalendarConfigured: () => true,
            listCalendarEvents: async () => [{
                id: 'google-1',
                eventId: 'google-1',
                title: 'Cita Thessa - Limpieza Facial',
                description: [
                    'Cliente: Cliente desde descripcion',
                    'Telefono WhatsApp: 5219990000000',
                    'Servicio: Limpieza Facial',
                    'Personas: 1',
                    'Información médica relevante: Alergia a fragancias',
                    'Estado: confirmada'
                ].join('\n'),
                startAt: '2099-07-10T16:00:00.000Z',
                endAt: '2099-07-10T17:00:00.000Z',
                htmlLink: 'https://calendar.google.com/event',
                source: 'google-calendar'
            }]
        }
    });

    try {
        const { res, result } = createResponse();
        await controller.getConfirmedAppointments({
            query: {
                start: '2099-07-01T00:00:00.000Z',
                end: '2099-07-31T00:00:00.000Z'
            }
        }, res);

        assert.equal(result.statusCode, 200);
        assert.equal(result.body.source, 'google');
        assert.equal(result.body.events.length, 1);
        assert.equal(result.body.events[0].eventId, 'google-1');
        assert.equal(result.body.events[0].status, 'confirmada');
        assert.equal(result.body.events[0].clientName, 'Cliente desde CRM');
        assert.equal(result.body.events[0].medicalCondition, 'Alergia a fragancias');
        assert.deepEqual(calls.range, {
            start: '2099-07-01T00:00:00.000Z',
            end: '2099-07-31T00:00:00.000Z'
        });
        assert.deepEqual(calls.phones, ['5219990000000']);
    } finally {
        cleanup();
    }
});

test('calendar endpoint reads Google event metadata from extended properties', async () => {
    const { controller, cleanup } = loadCalendarController({
        citasStorage: {
            listAppointmentsForRange: async () => []
        },
        clientesStorage: {
            getClientsByPhones: async () => []
        },
        googleCalendar: {
            isCalendarConfigured: () => true,
            listCalendarEvents: async () => [{
                id: 'google-2',
                eventId: 'google-2',
                title: 'Cita Thessa - Servicio',
                description: '',
                extendedProperties: {
                    private: {
                        status: 'confirmada',
                        phoneNumber: '5218880000000',
                        clientName: 'Cliente Metadata',
                        serviceName: 'Masaje Relajante',
                        people: '2',
                        participantNames: 'Ana López | Beatriz Pérez'
                    }
                },
                startAt: '2099-07-11T16:00:00.000Z',
                endAt: '2099-07-11T17:00:00.000Z',
                source: 'google-calendar'
            }]
        }
    });

    try {
        const { res, result } = createResponse();
        await controller.getConfirmedAppointments({
            query: {
                start: '2099-07-01T00:00:00.000Z',
                end: '2099-07-31T00:00:00.000Z'
            }
        }, res);

        assert.equal(result.statusCode, 200);
        assert.equal(result.body.events.length, 1);
        assert.equal(result.body.events[0].clientName, 'Cliente Metadata');
        assert.equal(result.body.events[0].phoneNumber, '5218880000000');
        assert.equal(result.body.events[0].serviceName, 'Masaje Relajante');
        assert.equal(result.body.events[0].people, '2');
        assert.deepEqual(result.body.events[0].participantNames, ['Ana López', 'Beatriz Pérez']);
        assert.equal(result.body.events[0].status, 'confirmada');
    } finally {
        cleanup();
    }
});

test('calendar endpoint does not return appointments that already ended', async () => {
    const calls = { rangeCalled: false, googleCalled: false };
    const { controller, cleanup } = loadCalendarController({
        citasStorage: {
            listAppointmentsForRange: async () => {
                calls.rangeCalled = true;
                return [{
                    id: 'local-past',
                    eventId: null,
                    name: 'Cliente pasado',
                    phoneNumber: '5217770000000',
                    serviceName: 'Servicio pasado',
                    people: 1,
                    status: 'confirmada',
                    startAt: '2000-01-01T10:00:00.000Z',
                    endAt: '2000-01-01T11:00:00.000Z'
                }];
            }
        },
        clientesStorage: {
            getClientsByPhones: async () => []
        },
        googleCalendar: {
            isCalendarConfigured: () => true,
            listCalendarEvents: async () => {
                calls.googleCalled = true;
                return [{
                    id: 'google-past',
                    eventId: 'google-past',
                    title: 'Cita Thessa - Servicio pasado',
                    description: 'Estado: confirmada',
                    startAt: '2000-01-01T10:00:00.000Z',
                    endAt: '2000-01-01T11:00:00.000Z',
                    source: 'google-calendar'
                }];
            }
        }
    });

    try {
        const { res, result } = createResponse();
        await controller.getConfirmedAppointments({
            query: {
                start: '2000-01-01T00:00:00.000Z',
                end: '2000-01-31T00:00:00.000Z'
            }
        }, res);

        assert.equal(result.statusCode, 200);
        assert.equal(result.body.events.length, 0);
        assert.equal(calls.rangeCalled, false);
        assert.equal(calls.googleCalled, false);
    } finally {
        cleanup();
    }
});
