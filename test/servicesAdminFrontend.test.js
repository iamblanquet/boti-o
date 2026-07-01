const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('services admin price rows use the class collected by saveService', () => {
    const filePath = path.join(__dirname, '..', 'public', 'services-admin', 'app.js');
    const source = fs.readFileSync(filePath, 'utf8');

    assert.match(source, /row\.className\s*=\s*'price-row /);
    assert.match(source, /querySelectorAll\('\.price-row'\)/);
    assert.match(source, /amountValue === '' \? null : Number\(amountValue\)/);
});

test('dashboard assisted appointment flow sends the selected service id', () => {
    const appPath = path.join(__dirname, '..', 'public', 'dashboard', 'app.js');
    const htmlPath = path.join(__dirname, '..', 'public', 'dashboard', 'index.html');
    const source = fs.readFileSync(appPath, 'utf8');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.match(html, /id="appointmentFlowModal"/);
    assert.match(html, /id="appointmentServiceList"/);
    assert.match(source, /startAppointmentFlowBtn\.addEventListener\('click', showAppointmentFlowModal\)/);
    assert.match(source, /body:\s*JSON\.stringify\(\{\s*serviceId:\s*service\.id\s*\}\)/);
});
