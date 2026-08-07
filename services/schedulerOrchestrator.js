/**
 * SchedulerOrchestrator - Orquestador modular de tareas en segundo plano.
 * Coordina la ejecución periódica de recordatorios y empujones conversacionales
 * de forma limpia, centralizada y con aislamiento estricto de errores por módulo.
 */

const { checkAppointmentReminders } = require('../models/citas/recordatorios');
const { checkServiceFollowupReminders } = require('../models/serviceFollowup');
const { checkConversationNudges } = require('../models/conversationNudgeService');

let timer = null;
let isProcessing = false;
const DEFAULT_INTERVAL_MS = 60000; // 1 minuto

/**
 * Ejecuta un ciclo completo de verificación de recordatorios.
 * Aísla fallos en un módulo para evitar que afecten a los demás.
 */
const runScheduledTasks = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await Promise.allSettled([
            checkAppointmentReminders().catch(err => 
                console.error('Error en recordatorios de citas:', err.message)
            ),
            checkServiceFollowupReminders().catch(err => 
                console.error('Error en seguimiento de servicios:', err.message)
            ),
            checkConversationNudges().catch(err => 
                console.error('Error en empujón conversacional:', err.message)
            )
        ]);
    } finally {
        isProcessing = false;
    }
};

/**
 * Inicia el orquestador de cron jobs.
 * @param {number} [intervalMs] Intervalo en milisegundos.
 */
const startScheduler = (intervalMs = DEFAULT_INTERVAL_MS) => {
    if (timer) return timer;
    
    // Ejecución inicial asíncrona
    runScheduledTasks();

    timer = setInterval(runScheduledTasks, intervalMs);
    return timer;
};

/**
 * Detiene el orquestador.
 */
const stopScheduler = () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

module.exports = {
    startScheduler,
    stopScheduler,
    runScheduledTasks
};
