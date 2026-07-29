const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const GuidedFlowRunner = require('../models/guidedFlowRunner');

const writeFlow = async (file, keyword, time) => {
    await fs.writeFile(file, JSON.stringify([{
        step: '0',
        previusStep: '0',
        keywords: [keyword],
        response: ['ok']
    }]), 'utf8');
    await fs.utimes(file, time, time);
};

test('guided flow reloads saved changes without restarting the process', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'thessa-flow-'));
    const file = path.join(directory, 'flow.json');

    try {
        await writeFlow(file, 'primer disparador', new Date('2030-01-01T00:00:00Z'));
        GuidedFlowRunner.__setResponsesFileForTest(file);
        assert.ok(GuidedFlowRunner.findStepResponse('primer disparador', 0));

        await writeFlow(file, 'nuevo disparador', new Date('2030-01-01T00:00:02Z'));
        assert.equal(GuidedFlowRunner.findStepResponse('primer disparador', 0), undefined);
        assert.ok(GuidedFlowRunner.findStepResponse('nuevo disparador', 0));

        await fs.writeFile(file, '{json invalido', 'utf8');
        await fs.utimes(file, new Date('2030-01-01T00:00:04Z'), new Date('2030-01-01T00:00:04Z'));
        assert.ok(GuidedFlowRunner.findStepResponse('nuevo disparador', 0));
    } finally {
        GuidedFlowRunner.__setResponsesFileForTest();
        await fs.rm(directory, { recursive: true, force: true });
    }
});
