/**
 * CacheManager - Servicio de almacenamiento en memoria RAM con TTL (Time-To-Live).
 * Desacoplado, ligero (sin dependencias externas) y con soporte de expiración e invalidación.
 */
class CacheManager {
    constructor(defaultTtlMs = 300000) { // 5 minutos por defecto
        this.store = new Map();
        this.defaultTtlMs = defaultTtlMs;
    }

    /**
     * Obtiene un elemento del caché si no ha expirado.
     * @param {string} key - Clave única del elemento.
     * @returns {any|null} El valor almacenado o null si no existe/expiró.
     */
    get(key) {
        const entry = this.store.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }

        return entry.value;
    }

    /**
     * Almacena un elemento en caché con un tiempo de expiración.
     * @param {string} key - Clave única.
     * @param {any} value - Valor a almacenar.
     * @param {number} [ttlMs] - Tiempo de vida en milisegundos.
     */
    set(key, value, ttlMs = this.defaultTtlMs) {
        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttlMs
        });
    }

    /**
     * Invalida un elemento específico del caché.
     * @param {string} key - Clave a eliminar.
     */
    invalidate(key) {
        this.store.delete(key);
    }

    /**
     * Limpia completamente la memoria en caché.
     */
    clear() {
        this.store.clear();
    }
}

module.exports = new CacheManager();
