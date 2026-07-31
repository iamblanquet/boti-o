const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs').promises;
const path = require('path');
const flowController = require('../controllers/flowController');
const Configuration = require('../models/configuration/repository');

const RESPONSES_FILE = path.join(__dirname, '../helpers/thessaResponses.json');
const BACKUP_FILE = path.join(__dirname, '../helpers/thessaResponses.json.backup');

const SYSTEM_MESSAGES_FILE = path.join(__dirname, '../helpers/systemMessages.json');
const SYSTEM_BACKUP_FILE = path.join(__dirname, '../helpers/systemMessages.json.backup');

test.describe('Flow Admin API', () => {
  const configurationRows = new Map();
  let hasBackup = false;
  let hasSystemBackup = false;

  test.before(async () => {
    Configuration.__setTestClient({
      from() {
        return {
          select() {
            return {
              eq(key) {
                return {
                  maybeSingle: async () => ({ data: configurationRows.get(key) || null, error: null })
                };
              }
            };
          },
          upsert(payload) {
            const previous = configurationRows.get(payload.key);
            const row = {
              value: payload.value,
              version: (previous?.version || 0) + 1,
              updated_at: payload.updated_at
            };
            configurationRows.set(payload.key, row);
            return {
              select() {
                return { single: async () => ({ data: row, error: null }) };
              }
            };
          }
        };
      }
    });
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
    Configuration.__setTestClient(null);
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

    const saved = await Configuration.getConversationFlow();
    assert.equal(saved[0].step, '1');
    assert.equal(saved[0].keywords[0], 'saludar');
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
      welcome_first_time: 'Hola y bienvenida a THESSA Spa.',
      welcome_returning: 'Qué gusto tenerte de nuevo en THESSA Spa.',
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

    const saved = await Configuration.getSystemMessageOverrides();
    assert.equal(saved.welcome_first_time, 'Hola y bienvenida a THESSA Spa.');
    assert.equal(saved.welcome_returning, 'Qué gusto tenerte de nuevo en THESSA Spa.');
    assert.equal(saved.service_category_intro, 'Custom Category Choice');
    assert.equal(saved.booking_success, 'Cita de {{service}} agendada para {{datetime}} a nombre de {{name}}');
    assert.equal(saved.promo_birthday_invitation, 'Custom club de beneficios invitation');
  });
});
