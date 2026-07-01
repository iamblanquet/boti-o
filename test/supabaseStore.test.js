const test = require('node:test');
const assert = require('node:assert/strict');

const loadStoreWithClient = (client) => {
    const storePath = require.resolve('../models/supabaseStore');
    const configPath = require.resolve('../config/supabase');
    const previousConfig = require.cache[configPath];

    delete require.cache[storePath];
    require.cache[configPath] = {
        id: configPath,
        filename: configPath,
        loaded: true,
        exports: () => client
    };

    const store = require('../models/supabaseStore');

    return {
        store,
        cleanup: () => {
            delete require.cache[storePath];
            if(previousConfig) require.cache[configPath] = previousConfig;
            else delete require.cache[configPath];
        }
    };
};

const createSupabaseMock = (rows, calls) => ({
    from(table) {
        if(table === 'conversations') {
            return {
                update(values) {
                    calls.push({ table, op: 'update', values });
                    return {
                        eq: async (column, value) => {
                            calls.push({ table, op: 'eq', column, value });
                            return { data: null, error: null };
                        }
                    };
                }
            };
        }

        const builder = {
            _rows: [...rows],
            select(columns) {
                calls.push({ table, op: 'select', columns });
                return this;
            },
            eq(column, value) {
                calls.push({ table, op: 'eq', column, value });
                this._rows = this._rows.filter((row) => row[column] === value);
                return this;
            },
            order(column, options) {
                calls.push({ table, op: 'order', column, options });
                this._rows = this._rows.sort((a, b) => {
                    const left = new Date(a[column] || 0);
                    const right = new Date(b[column] || 0);
                    return options?.ascending === false ? right - left : left - right;
                });
                return this;
            },
            async limit(count) {
                calls.push({ table, op: 'limit', count });
                return { data: this._rows.slice(0, count), error: null };
            }
        };

        return builder;
    }
});

test('SupabaseStore.getMessages reads the latest dashboard window in chronological order', async () => {
    const previousLimit = process.env.DASHBOARD_MESSAGES_LIMIT;
    process.env.DASHBOARD_MESSAGES_LIMIT = '2';

    const calls = [];
    const client = createSupabaseMock([
        {
            message_id: 'old',
            phone_number: '529811695579',
            direction: 'in',
            source: 'client',
            type: 'text',
            text: 'old message',
            metadata: {},
            created_at: '2026-06-18T20:05:19.932+00:00'
        },
        {
            message_id: 'middle',
            phone_number: '529811695579',
            direction: 'out',
            source: 'human',
            type: 'text',
            text: 'middle message',
            metadata: {},
            created_at: '2026-06-22T20:17:08.281+00:00'
        },
        {
            message_id: 'new',
            phone_number: '529811695579',
            direction: 'out',
            source: 'human',
            type: 'text',
            text: 'new message',
            metadata: {},
            created_at: '2026-06-22T20:27:44.090+00:00'
        }
    ], calls);

    const { store, cleanup } = loadStoreWithClient(client);

    try {
        const messages = await store.getMessages('529811695579');

        assert.deepEqual(messages.map((message) => message.text), [
            'middle message',
            'new message'
        ]);

        assert.deepEqual(
            calls.find((call) => call.table === 'messages' && call.op === 'order'),
            {
                table: 'messages',
                op: 'order',
                column: 'created_at',
                options: { ascending: false }
            }
        );
        assert.equal(calls.find((call) => call.table === 'messages' && call.op === 'limit').count, 2);
    } finally {
        cleanup();
        if(previousLimit === undefined) delete process.env.DASHBOARD_MESSAGES_LIMIT;
        else process.env.DASHBOARD_MESSAGES_LIMIT = previousLimit;
    }
});
