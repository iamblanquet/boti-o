require('dotenv').config();
const XLSX = require('xlsx');
const CatalogStore = require('../models/serviceCatalogStore');

if (process.argv[2] && process.argv[3] && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = process.argv[2];
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.argv[3];
}

const excelPath = 'C:\\Users\\Soporte TI Junior\\Desktop\\TRATAMIENTOS THESSA (2).xlsx';

const parseDurationMinutes = (raw) => {
    if(!raw) return null;
    const text = String(raw).toLowerCase().trim();
    if(text.includes('una hora y media') || text.includes('1 hora y media')) return 90;
    if(text.includes('una hora') || text.includes('1 hora')) return 60;
    const match = text.match(/(\d+)\s*min/);
    if(match) return parseInt(match[1], 10);
    const digitMatch = text.match(/\d+/);
    return digitMatch ? parseInt(digitMatch[0], 10) : null;
};

const parsePrice = (raw) => {
    if(raw === null || raw === undefined) return null;
    if(typeof raw === 'number') return raw;
    const clean = String(raw).replace(/[^\d.]/g, '');
    const num = parseFloat(clean);
    return Number.isFinite(num) ? num : null;
};

const parsePackages = (rawPackageText, pkg7Ses = null, pkg7Msi = null) => {
    const packages = [];
    if(pkg7Ses) {
        packages.push({
            nombre: 'Paquete 7 Sesiones',
            sesiones: 7,
            precio: parsePrice(pkg7Ses),
            descripcion: pkg7Msi ? `Opción MSI: $${pkg7Msi}` : ''
        });
    }
    if(rawPackageText) {
        const text = String(rawPackageText).trim();
        // Regex para buscar "paquete de X sesiones $Y" o "paquete $Y"
        const matches = [...text.matchAll(/paquete\s*(?:de\s*)?(\d+)?\s*sesiones?\s*\$?([\d,.]+)/gi)];
        if(matches.length) {
            matches.forEach((m) => {
                const sesiones = m[1] ? parseInt(m[1], 10) : 5;
                const precio = parsePrice(m[2]);
                if(precio) {
                    packages.push({
                        nombre: `Paquete ${sesiones} Sesiones`,
                        sesiones,
                        precio,
                        descripcion: text
                    });
                }
            });
        } else {
            const price = parsePrice(text);
            if(price) {
                packages.push({
                    nombre: 'Paquete de Sesiones',
                    sesiones: 5,
                    precio: price,
                    descripcion: text
                });
            }
        }
    }
    return packages;
};

const findVal = (row, keyNames) => {
    const keys = Object.keys(row);
    for(const name of keyNames) {
        const foundKey = keys.find((k) => k.trim().toLowerCase().replace(/\s+/g, '') === name.trim().toLowerCase().replace(/\s+/g, ''));
        if(foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
            return row[foundKey];
        }
    }
    return null;
};

const runImport = async () => {
    const workbook = XLSX.readFile(excelPath);
    console.log('--- INICIANDO IMPORTACIÓN DE EXCEL A SUPABASE ---');

    let totalCreated = 0;

    for(let i = 0; i < workbook.SheetNames.length; i++) {
        const rawSheetName = workbook.SheetNames[i];
        const categoryName = rawSheetName.trim().toUpperCase();
        console.log(`\n📌 Procesando Categoría: "${categoryName}"`);

        // Crear/Upsert categoría en Supabase
        await CatalogStore.upsertCategory({
            name: categoryName,
            sort_order: (i + 1) * 10
        });

        const sheet = workbook.Sheets[rawSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        for(const row of rows) {
            const rawName = findVal(row, ['tratamientos', 'nombre', 'tratamiento']);
            const area = findVal(row, ['area', 'zona']);
            if(!rawName && !area) continue;

            const name = area ? `${String(rawName).trim()} (${String(area).trim()})` : String(rawName).trim();
            const precio = parsePrice(findVal(row, ['precios', 'precios unasesion', 'precio', 'preciosunasesion']));
            const duracion = parseDurationMinutes(findVal(row, ['duracion', 'duración']));
            const descripcion = String(findVal(row, ['descripcion corta', 'descripcioncorta', 'descripcion']) || '').trim();
            const beneficiosRaw = findVal(row, ['beneficios', 'brnrficios']) || '';
            const productosRaw = findVal(row, ['conque productos realizan', 'con que productos realizan', 'conqueproductosrealizan']) || '';
            const cuidados = findVal(row, ['cuidados', 'cuidados ']) || '';
            const recomendacion = findVal(row, ['cada cuento es recomendable', 'cada cuento es recomendable ', 'cada cuanto es recomendable']) || '';

            const pkg7Ses = findVal(row, ['paquete 7 sesiones', 'paquete7sesiones']);
            const pkg7Msi = findVal(row, ['paquete 7 sesion msi', 'paquete7sesionmsi']);
            const paquetesRaw = findVal(row, ['paquetes', 'paquetes ']);

            const beneficios = String(beneficiosRaw).split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
            const productos = String(productosRaw).split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);

            const preCare = String(cuidados || '').trim();
            const postCare = String(recomendacion ? `Frecuencia recomendada: ${recomendacion}` : '').trim();

            const paquetes = parsePackages(paquetesRaw, pkg7Ses, pkg7Msi);

            const payload = {
                nombre: name,
                categoria: categoryName,
                descripcion,
                duracionMinutos: duracion || 45,
                precio: precio || 0,
                beneficios,
                productos,
                cuidadosPrevios: preCare,
                cuidadosPosteriores: postCare,
                paquetes
            };

            await CatalogStore.upsertService(payload);
            totalCreated++;
            console.log(`  ✅ Servicio importado: "${name}" - $${precio || 0} (${categoryName})`);
        }
    }

    console.log(`\n🎉 IMPORTACIÓN COMPLETADA: ${totalCreated} tratamientos procesados exitosamente.`);
    process.exit(0);
};

runImport().catch((err) => {
    console.error('❌ Error en importación:', err);
    process.exit(1);
});
