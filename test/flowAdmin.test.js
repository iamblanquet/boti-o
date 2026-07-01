const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs').promises;
const path = require('path');
const flowController = require('../controllers/flowController');

const RESPONSES_FILE = path.join(__dirname, '../helpers/thessaResponses.json');
const BACKUP_FILE = path.join(__dirname, '../helpers/thessaResponses.json.backup');

const SYSTEM_MESSAGES_FILE = path.join(__dirname, '../helpers/systemMessages.json');
const SYSTEM_BACKUP_FILE = path.join(__dirname, '../helpers/systemMessages.json.backup');

test.describe('Flow Admin API', () => {
  let hasBackup = false;
  let hasSystemBackup = false;

  test.before(async () => {
    // Backup original responses
    try {
      await fs.copyFile(RESPONSES_FILE, BACKUP_FILE);
      hasBackup = true;
    } catch (e) {}

    // Backup system messages
    try {
      await fs.copyFile(SYSTEM_MESSAGES_FILE, SYSTEM_BACKUP_FILE);
      hasSystemBackup = true;
    } catch (e) {}
  });

  test.after(async () => {
    // Restore backup responses
    if (hasBackup) {
      await fs.copyFile(BACKUP_FILE, RESPONSES_FILE);
      await fs.unlink(BACKUP_FILE);
    } else {
      try {
        await fs.unlink(RESPONSES_FILE);
      } catch (e) {}
    }

    // Restore backup system messages
    if (hasSystemBackup) {
      await fs.copyFile(SYSTEM_BACKUP_FILE, SYSTEM_MESSAGES_FILE);
      await fs.unlink(SYSTEM_BACKUP_FILE);
    } else {
      try {
        await fs.unlink(SYSTEM_MESSAGES_FILE);
      } catch (e) {}
    }
  });

  test('GET /api/flow - returns conversational flow array', async () => {
    const sample = [{ step: '0', previusStep: '0', keywords: ['test_trigger'], response: ['hello'] }];
    await fs.writeFile(RESPONSES_FILE, JSON.stringify(sample), 'utf8');

    let responseData = null;
    const req = {};
    const res = {
      status(code) {
        assert.equal(code, 200);
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    await flowController.getFlow(req, res);
    assert.ok(Array.isArray(responseData));
    assert.equal(responseData[0].keywords[0], 'test_trigger');
  });

  test('POST /api/flow - rejects invalid flows', async () => {
    const invalidPayloads = [
      { step: '0' },
      [{ keywords: ['hello'] }],
      [{ step: '0', keywords: 'hello' }],
      [{ step: '0', keywords: [123] }]
    ];

    for (const payload of invalidPayloads) {
      let statusCalledWith = null;
      let errorResponse = null;

      const req = { body: payload };
      const res = {
        status(code) {
          statusCalledWith = code;
          return this;
        },
        json(data) {
          errorResponse = data;
          return this;
        }
      };

      await flowController.updateFlow(req, res);
      assert.equal(statusCalledWith, 400);
      assert.ok(errorResponse.error);
    }
  });

  test('POST /api/flow - successfully saves valid flow', async () => {
    const validPayload = [
      {
        step: '1',
        previusStep: '0',
        keywords: ['saludar', 'bienvenida'],
        response: ['Hola cliente'],
        type: 'text'
      }
    ];

    let statusCalledWith = null;
    const req = { body: validPayload };
    const res = {
      status(code) {
        statusCalledWith = code;
        return this;
      },
      json(data) {
        return this;
      }
    };

    await flowController.updateFlow(req, res);
    assert.equal(statusCalledWith, 200);

    const onDisk = JSON.parse(await fs.readFile(RESPONSES_FILE, 'utf8'));
    assert.equal(onDisk[0].step, '1');
    assert.equal(onDisk[0].keywords[0], 'saludar');
  });

  test('GET /api/flow/system-messages - returns all default and custom messages', async () => {
    // Force writing custom setting
    await fs.writeFile(SYSTEM_MESSAGES_FILE, JSON.stringify({ service_category_intro: 'Custom Intro Text' }), 'utf8');

    let responseData = null;
    const req = {};
    const res = {
      status(code) {
        assert.equal(code, 200);
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    await flowController.getSystemMessages(req, res);
    assert.equal(responseData.service_category_intro, 'Custom Intro Text');
    assert.ok(responseData.service_select_intro); // Falls back to default
    assert.ok(responseData.promo_birthday_invitation);
    assert.ok(responseData.promo_birthday_ask);
    assert.ok(responseData.promo_email_ask);
  });

  test('POST /api/flow/system-messages - saves custom messages successfully', async () => {
    const payload = {
      service_category_intro: 'Custom Category Choice',
      booking_success: 'Cita de {{service}} agendada para {{datetime}} a nombre de {{name}}',
      promo_birthday_invitation: 'Custom club de beneficios invitation'
    };

    let statusCalledWith = null;
    const req = { body: payload };
    const res = {
      status(code) {
        statusCalledWith = code;
        return this;
      },
      json(data) {
        return this;
      }
    };

    await flowController.updateSystemMessages(req, res);
    assert.equal(statusCalledWith, 200);

    const onDisk = JSON.parse(await fs.readFile(SYSTEM_MESSAGES_FILE, 'utf8'));
    assert.equal(onDisk.service_category_intro, 'Custom Category Choice');
    assert.equal(onDisk.booking_success, 'Cita de {{service}} agendada para {{datetime}} a nombre de {{name}}');
    assert.equal(onDisk.promo_birthday_invitation, 'Custom club de beneficios invitation');
  });
});
