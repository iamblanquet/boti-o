# Modulos De Citas

La carpeta `models/citas` agrupa todo lo relacionado con agendar, confirmar, cancelar y recordar citas.

## Entrada Principal

El resto del bot entra al flujo de citas por `models/citas/flujo.js`.

## `models/citas/flujo.js`

Conecta el flujo de citas con el estado general de la conversacion. Inicia citas, continua flujos activos y permite iniciar una cita desde un servicio ya seleccionado.

## `models/citas/controlador.js`

Controlador principal del flujo de citas. Decide si el mensaje confirma, cancela, reprograma, continua una cita pendiente, pide el siguiente dato o delega a IA durante el flujo.

## `models/citas/reglas.js`

Reglas puras de citas: modos del flujo, deteccion de intenciones, respuestas afirmativas/negativas, lectura de payloads de botones y calculo de campos faltantes.

## `models/citas/datos.js`

Extrae datos de cita desde texto, botones y catalogo: servicio, fecha, hora, personas y tipo de solicitud.

## `models/citas/lectorMensaje.js`

Interpreta mensajes mientras el cliente ya esta dentro de un flujo de cita. Combina IA, parser manual, botones y estado actual.

## `models/citas/preguntas.js`

Envia las preguntas del flujo: categorias, servicios, dias disponibles, horarios disponibles y numero de personas.

## `models/citas/mensajesWhatsapp.js`

Construye mensajes interactivos de WhatsApp para botones y listas. Centraliza limites de texto y truncado.

## `models/citas/disponibilidad.js`

Calcula dias y horarios disponibles usando horario de atencion y Google Calendar.

## `models/citas/agenda.js`

Valida horarios, revisa disponibilidad exacta, crea citas, reprograma citas y guarda los cambios.

## `models/citas/confirmacionCancelacion.js`

Maneja confirmar, cancelar, continuar cancelacion y enviar invitaciones de calendario.

## `models/citas/formato.js`

Helpers pequenos para textos de citas: horario de atencion, nombre del servicio y titulo de dias.

## `models/citas/extractor.js`

Extractor con IA para identificar datos de cita como nombre, servicio, fecha, hora y numero de personas.

## `models/citas/almacenamiento.js`

Capa de persistencia de citas y flujos. Usa respaldo local y Supabase cuando esta configurado.

## `models/citas/recordatorios.js`

Logica de recordatorios para citas proximas.
