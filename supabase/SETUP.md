# Supabase setup (Thessa bot)

1. Crea un proyecto en Supabase.
2. En SQL Editor ejecuta el contenido de `supabase/schema.sql`.
3. Agrega en tu `.env`:

```env
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
```

4. Si ya existen citas en `data/appointments.json`, migralas con:

```bash
npm run appointments:migrate
```

5. Reinicia el servidor:

```bash
npm start
```

## Que quedo integrado

- Persistencia opcional de `conversations`, `messages` y `appointments` a Supabase.
- Las citas usan Supabase primero y caen al respaldo local/Redis si la tabla todavia no existe.
- Si no hay variables de Supabase, el bot sigue funcionando con los respaldos locales/temporales.
- No se cambio el flujo de WhatsApp ni Gemini; solo se anadio capa de persistencia.
