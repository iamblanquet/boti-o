# Migracion de configuracion editable

La configuracion modificada desde **Administracion de flujos** se guarda en la tabla `bot_configuration` de Supabase. Ya no depende de archivos del checkout de Git.

## Aplicacion inicial

1. Ejecuta `supabase/schema.sql` desde el SQL Editor de Supabase.
2. Desde la raiz del proyecto ejecuta:

   ```powershell
   npm.cmd run configuracion:migrar
   ```

3. Reinicia el servidor y comprueba que el panel carga el flujo y los mensajes.

La migracion no sobrescribe claves que ya existen en Supabase. Durante la transicion, los JSON locales se usan solo como fallback de lectura si Supabase no contiene la configuracion o no esta disponible.
