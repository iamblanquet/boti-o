const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const loadClassify = () => {
    let source = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard', 'app.js'), 'utf8');
    source = source.replace(/\r/g, '');
    const start = source.indexOf('const classify = ');
    const end = source.indexOf('\n\nconst getCurrentChat', start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);

    return vm.runInNewContext(`${source.slice(start, end)}\nclassify;`, { normalize });
};

test('dashboard classification prioritizes confirmed appointment data over message keywords', () => {
    const classify = loadClassify();
    const result = classify({
        lastMessage: 'quiero agendar otra cosa',
        incomingCount: 1,
        outgoingCount: 1,
        messageCount: 2,
        appointmentSummary: {
            hasHistory: true,
            activeStatus: 'confirmada',
            totalCount: 1
        }
    });

    assert.equal(result.tag, 'Confirmada');
});

test('dashboard classification treats pending active appointments as probable appointments', () => {
    const classify = loadClassify();
    const result = classify({
        lastMessage: 'hola',
        incomingCount: 1,
        outgoingCount: 0,
        messageCount: 1,
        appointmentSummary: {
            hasHistory: true,
            activeStatus: 'pendiente',
            totalCount: 1
        }
    });

    assert.equal(result.tag, 'Cita probable');
    assert.equal(result.intent, 'Cita pendiente de confirmar');
});

test('dashboard classification does not mark returning appointment clients as new chat', () => {
    const classify = loadClassify();
    const result = classify({
        lastMessage: 'hola',
        incomingCount: 1,
        outgoingCount: 0,
        messageCount: 1,
        appointmentSummary: {
            hasHistory: true,
            activeStatus: null,
            totalCount: 2
        }
    });

    assert.equal(result.tag, 'Seguimiento');
});

test('dashboard classification uses conversation age to detect follow-up chats', () => {
    const classify = loadClassify();
    const result = classify({
        lastMessage: 'hola',
        incomingCount: 1,
        outgoingCount: 0,
        messageCount: 1,
        createdAt: '2026-06-01T12:00:00.000Z',
        lastAt: '2026-06-22T20:00:00.000Z'
    });

    assert.equal(result.tag, 'Seguimiento');
});

test('dashboard classification keeps a first greeting as new chat', () => {
    const classify = loadClassify();
    const result = classify({
        lastMessage: 'hola',
        incomingCount: 1,
        outgoingCount: 0,
        messageCount: 1,
        createdAt: '2026-06-22T20:00:00.000Z',
        lastAt: '2026-06-22T20:00:30.000Z'
    });

    assert.equal(result.tag, 'Nuevo chat');
});

test('dashboard classification does not turn historical appointment references into probable appointments', () => {
    const classify = loadClassify();
    const result = classify({
        lastMessage: 'alguna sugerencia antes de mi cita?',
        incomingCount: 3,
        outgoingCount: 4,
        messageCount: 7,
        appointmentSummary: {
            hasHistory: true,
            activeStatus: null,
            totalCount: 1
        }
    });

    assert.equal(result.tag, 'Seguimiento');
});
