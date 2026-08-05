const test = require('node:test');
const assert = require('node:assert/strict');
const CatalogStore = require('../models/serviceCatalogStore');

const createMemorySupabase = () => {
    const db = {
        service_categories: [],
        services: [],
        service_prices: [],
        service_faqs: []
    };

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const primaryKey = (table) => table === 'service_prices' ? 'id' : 'id';

    const builder = (table) => ({
        select: async () => ({ data: clone(db[table] || []), error: null }),
        insert: async (rows) => {
            const items = Array.isArray(rows) ? rows : [rows];
            items.forEach((item) => {
                const row = { ...item };
                if(table === 'service_prices' && !row.id) row.id = `${row.service_id}-${row.people}`;
                db[table].push(row);
            });
            return { data: clone(items), error: null };
        },
        upsert: async (rows) => {
            const items = Array.isArray(rows) ? rows : [rows];
            items.forEach((item) => {
                const key = primaryKey(table);
                const index = db[table].findIndex((row) => row[key] === item[key]);
                if(index >= 0) db[table][index] = { ...db[table][index], ...item };
                else db[table].push({ ...item });
            });
            return { data: clone(items), error: null };
        },
        update(values) {
            return {
                eq: async (column, value) => {
                    db[table] = db[table].map((row) => row[column] === value ? { ...row, ...values } : row);
                    return { data: null, error: null };
                }
            };
        },
        delete() {
            return {
                eq: async (column, value) => {
                    db[table] = db[table].filter((row) => row[column] !== value);
                    return { data: null, error: null };
                }
            };
        },
        _db: db
    });

    return {
        from: builder,
        db
    };
};

test('service catalog store persists service prices on create and update', async () => {
    const supabase = createMemorySupabase();
    CatalogStore.__setTestClient(supabase);

    try {
        await CatalogStore.createCategory({ id: 'depilaciones', nombre: 'Depilaciones' });
        await CatalogStore.createService({
            id: 'depilacion-laser-medio-brazo',
            nombre: 'Depilación Láser - Medio Brazo',
            categoria: 'Depilaciones',
            duracionMinutos: 30,
            preciosPersonas: [
                { personas: 1, precio: 275, exclusivo: false }
            ],
            descripcion: 'Servicio de depilacion laser.',
            cuidadosPrevios: 'Antes de {{service}}, evita el sol.',
            cuidadosPosteriores: 'Después de {{service}}, usa protector solar.'
        });

        let catalog = await CatalogStore.readEditableCatalog();
        let service = catalog.services.find((item) => item.id === 'depilacion-laser-medio-brazo');
        assert.equal(service.precio, 275);
        assert.equal(service.cuidadosPrevios, 'Antes de {{service}}, evita el sol.');
        assert.equal(service.cuidadosPosteriores, 'Después de {{service}}, usa protector solar.');
        assert.deepEqual(service.preciosPersonas.map((item) => item.precio), [275]);

        await CatalogStore.updateService('depilacion-laser-medio-brazo', {
            nombre: 'Depilación Láser - Medio Brazo',
            categoria: 'Depilaciones',
            duracionMinutos: 30,
            preciosPersonas: [
                { personas: 1, precio: 350, exclusivo: false },
                { personas: 2, precio: 600, exclusivo: true }
            ],
            descripcion: 'Servicio de depilacion laser actualizado.',
            cuidadosPrevios: 'Llega con la piel limpia antes de {{service}}.',
            cuidadosPosteriores: 'Evita el sol después de tu {{service}}.'
        });

        catalog = await CatalogStore.readEditableCatalog();
        service = catalog.services.find((item) => item.id === 'depilacion-laser-medio-brazo');
        assert.equal(service.precio, 350);
        assert.deepEqual(
            service.preciosPersonas.map((item) => ({ personas: item.personas, precio: item.precio, exclusivo: item.exclusivo })),
            [
                { personas: 1, precio: 350, exclusivo: false },
                { personas: 2, precio: 600, exclusivo: true }
            ]
        );
        assert.equal(supabase.db.service_prices.length, 2);
        assert.equal(service.cuidadosPrevios, 'Llega con la piel limpia antes de {{service}}.');
        assert.equal(service.cuidadosPosteriores, 'Evita el sol después de tu {{service}}.');
    } finally {
        CatalogStore.__setTestClient(null);
    }
});

test('service catalog removes an image when an empty image value is saved', async () => {
    const supabase = createMemorySupabase();
    CatalogStore.__setTestClient(supabase);

    try {
        await CatalogStore.createService({
            id: 'servicio-con-imagen',
            nombre: 'Servicio con imagen',
            categoria: 'Servicios',
            imagen: 'https://example.supabase.co/storage/v1/object/public/service-images/services/image.jpg'
        });
        await CatalogStore.updateService('servicio-con-imagen', { imagen: '' });

        const catalog = await CatalogStore.readEditableCatalog();
        assert.equal(catalog.services.find((service) => service.id === 'servicio-con-imagen').imagen, '');
    } finally {
        CatalogStore.__setTestClient(null);
    }
});

test('service catalog keeps a base price without creating people price tiers', async () => {
    const supabase = createMemorySupabase();
    CatalogStore.__setTestClient(supabase);

    try {
        await CatalogStore.createService({
            id: 'servicio-precio-base',
            nombre: 'Servicio precio base',
            categoria: 'Servicios',
            precio: 800,
            preciosPersonas: []
        });

        const catalog = await CatalogStore.readEditableCatalog();
        const service = catalog.services.find((item) => item.id === 'servicio-precio-base');
        assert.equal(service.precio, 800);
        assert.deepEqual(service.preciosPersonas, []);
    } finally {
        CatalogStore.__setTestClient(null);
    }
});
