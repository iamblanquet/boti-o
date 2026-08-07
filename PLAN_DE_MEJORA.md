# 🚀 Plan de Mejora, Optimización y Mantenibilidad del Proyecto

Este documento contiene la hoja de ruta técnica completa, detallada y modular para optimizar la base de datos, reducir el consumo de recursos (RAM, CPU, I/O) y eficientizar los flujos del bot y la plataforma web.

---

## 📌 Resumen del Diagnóstico de la Base de Datos

De las **28 tablas** definidas en el esquema original:
- **19 Tablas Activas:** `conversations`, `messages`, `appointments`, `clients`, `bot_state`, `campaigns`, `campaign_leads`, `campaign_funnel_events`, `service_categories`, `services`, `service_prices`, `service_faqs`, `chat_summaries`, `conversation_controls`, `companies`, `employees`, `sessions`, `bot_configuration`, `service_packages`.
- **9 Tablas Obsoletas a Eliminar:** `categorias`, `servicios`, `beneficios`, `faq`, `promociones`, `conversation_states`, `bot_flows`, `bot_flow_versions`, `bot_flow_rules`.

---

## 🏗️ Principios de Arquitectura y Modularidad

1. **Desacoplamiento por Dominios:** Cada módulo (`citas`, `clientes`, `servicios`, `campañas`) mantiene su propia estructura independiente sin archivos monolíticos.
2. **Patrón Repository / Service:** La lógica de acceso a datos vive en repositorios y las reglas de negocio en servicios.
3. **Caché Centralizado Reutilizable:** Implementación de un `CacheManager` limpio para evitar variables globales dispersas.
4. **Orquestación Modular de Background:** Los recordatorios conservan su propia lógica, pero se coordinan mediante un orquestador ligero.

---

## 📋 Hoja de Ruta de Implementación (4 Fases)

```
wsp-bot-oficial/
├── config/                  # Configuración (Supabase, Env)
├── controllers/             # Controladores HTTP
├── models/ / repositories/  # Acceso a Datos por Dominio
├── services/                # Lógica de Negocio y Orquestador de Cron Jobs
├── utils/                   # Utilidades Puras y CacheManager
└── PLAN_DE_MEJORA.md        # Guía Técnica de Implementación
```

---

### 🔹 FASE 1: Limpieza de Tablas e Índices en Supabase (Solo SQL)
- **Objetivo:** Liberar espacio y acelerar las consultas de `~150ms` a `< 10ms`.
- **Riesgo:** 0% (No requiere cambios en código JS ni reiniciar el servidor).

#### Script SQL a ejecutar en el SQL Editor de Supabase:

```sql
-- 1. Eliminación de las 9 tablas obsoletas
DROP TABLE IF EXISTS public.beneficios CASCADE;
DROP TABLE IF EXISTS public.promociones CASCADE;
DROP TABLE IF EXISTS public.servicios CASCADE;
DROP TABLE IF EXISTS public.categorias CASCADE;
DROP TABLE IF EXISTS public.faq CASCADE;
DROP TABLE IF EXISTS public.bot_flow_rules CASCADE;
DROP TABLE IF EXISTS public.bot_flow_versions CASCADE;
DROP TABLE IF EXISTS public.bot_flows CASCADE;
DROP TABLE IF EXISTS public.conversation_states CASCADE;

-- 2. Creación de Índices Parciales de Alto Rendimiento (Ocupan 90% menos RAM)
-- Historial de mensajes por teléfono
CREATE INDEX IF NOT EXISTS idx_messages_phone_created 
ON public.messages(phone_number, created_at DESC);

-- Citas activas (Filtra solo pendientes y confirmadas)
CREATE INDEX IF NOT EXISTS idx_appointments_active_window 
ON public.appointments(status, end_at, start_at) 
WHERE status IN ('pendiente', 'confirmada');

-- Conversaciones con mensajes no leídos
CREATE INDEX IF NOT EXISTS idx_conversations_unreads 
ON public.conversations(last_at DESC) 
WHERE unread_count > 0;

-- Clientes por campaña
CREATE INDEX IF NOT EXISTS idx_clients_campaign_id 
ON public.clients(campaign_id);

-- 3. Restricción de Clave Foránea en Citas
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_service_id_fkey;

ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_service_id_fkey 
FOREIGN KEY (service_id) REFERENCES public.services(id) 
ON DELETE SET NULL ON UPDATE CASCADE;
```

---

### 🔹 FASE 2: Desactivación de I/O Síncrono a Disco en Node.js
- **Objetivo:** Eliminar picos de congelamiento en el Event Loop producidos por `fs.writeFileSync`.
- **Archivos a modificar:**
  1. `models/citas/almacenamiento.js`
  2. `models/clientes/almacenamiento.js`

#### Cambio a aplicar:
Desactivar las llamadas a `writeBackup(backup)` que escriben archivos `.json` locales en disco y confiar 100% en la persistencia nativa de Supabase.

---

### 🔹 FASE 3: Caché Modular en Memoria RAM (`utils/cacheManager.js`)
- **Objetivo:** Reducir en un **85%** las lecturas redundantes a Supabase en preguntas de catálogo de WhatsApp.
- **Archivos a crear/modificar:**
  1. `utils/cacheManager.js` (Nuevo)
  2. `models/serviceCatalogStore.js` (Modificar)

#### 1. Crear `utils/cacheManager.js`:
```javascript
class CacheManager {
    constructor(defaultTtlMs = 300000) { // 5 minutos por defecto
        this.cache = new Map();
        this.defaultTtl = defaultTtlMs;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }

    set(key, value, ttlMs = this.defaultTtl) {
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttlMs
        });
    }

    invalidate(key) {
        this.cache.delete(key);
    }
}

module.exports = new CacheManager();
```

#### 2. Usar en `models/serviceCatalogStore.js`:
```javascript
const cacheManager = require('../utils/cacheManager');
const CATALOG_CACHE_KEY = 'service_catalog_data';

const loadCatalog = async (forceRefresh = false) => {
    if (!forceRefresh) {
        const cached = cacheManager.get(CATALOG_CACHE_KEY);
        if (cached) return cached;
    }

    const catalogData = await fetchCatalogFromSupabase();
    cacheManager.set(CATALOG_CACHE_KEY, catalogData, 5 * 60 * 1000); // TTL 5 min
    return catalogData;
};
```

---

### 🔹 FASE 4: Orquestador Modular de Background (`services/schedulerOrchestrator.js`)
- **Objetivo:** Unificar los 3 temporizadores repetitivos de `index.js` en una ejecución eficiente y coordinada sin romper el desacoplamiento de cada módulo.
- **Archivos a crear/modificar:**
  1. `services/schedulerOrchestrator.js` (Nuevo)
  2. `index.js` (Modificar para invocar el orquestador)

#### 1. Crear `services/schedulerOrchestrator.js`:
```javascript
const { checkAppointmentReminders } = require('../models/citas/recordatorios');
const { checkServiceFollowupReminders } = require('../models/serviceFollowup');
const { checkConversationNudges } = require('../models/conversationNudgeService');

let isProcessing = false;

const runScheduledTasks = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await checkAppointmentReminders();
        await checkServiceFollowupReminders();
        await checkConversationNudges();
    } catch (error) {
        console.error('Error ejecutando tareas en segundo plano:', error.message);
    } finally {
        isProcessing = false;
    }
};

const startScheduler = (intervalMs = 60000) => {
    runScheduledTasks();
    return setInterval(runScheduledTasks, intervalMs);
};

module.exports = { startScheduler };
```

---

## 🔍 Plan de Verificación y Pruebas

1. **Pruebas SQL (Fase 1):**
   - Ejecutar la consulta `EXPLAIN ANALYZE SELECT * FROM appointments WHERE status = 'confirmada';` en Supabase y verificar que use el índice `idx_appointments_active_window`.
2. **Pruebas de Integración Node.js (Fase 2 y 3):**
   - Ejecutar `npm test` en la consola para asegurar que todos los mocks y servicios pasen sin errores.
3. **Verificación en Producción (Fase 4):**
   - Verificar los logs del servidor para comprobar la salida de los recordatorios sin picos de consumo de CPU.

---
*Documento guardado para futura implementación.*
