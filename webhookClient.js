const { CONFIG } = require("./config.js");
const { logger } = require("./utils.js");
const crypto = require("crypto");

/**
 * Estados de impresión para notificar al WRAPPER_API
 * 
 * Solo se notifica el RESULTADO de cada intento:
 * - SUCCESS: Impresión completada exitosamente
 * - FAILED: Falló un intento (se reintentará si no alcanzó MAX_RETRIES)
 * 
 * NOTA: No existe estado "DEAD" porque el último intento fallido ya notifica "failed".
 * Laravel determina que está muerto cuando attempts >= MAX_RETRIES.
 */
const PRINT_JOB_STATUSES = {
  SUCCESS: "success",         // Impresión exitosa
  FAILED: "failed"            // Falló un intento
};

/**
 * Notifica al WRAPPER_API sobre el estado de un job de impresión
 * 
 * @param {Object} params
 * @param {string} params.printJobId - UUID del job (creado por WRAPPER_API)
 * @param {string} params.status - Estado del job (usar PRINT_JOB_STATUSES)
 * @param {number} [params.attemptNumber] - Número del intento actual
 * @param {Error} [params.error] - Error si falló
 */
async function notifyPrintJobStatus({ 
  printJobId, 
  status, 
  attemptNumber = 0,
  error = null 
}) {
  if (!CONFIG.API_WEBHOOK_URL) {
    logger.debug("API_WEBHOOK_URL no configurada, saltando notificación");
    return { success: true };
  }

  const payload = {
    status: status, // 'success', 'failed', 'retry', 'dead'
    attempt_number: attemptNumber,
    attempted_at: new Date().toISOString(),
    error_message: error ? error.message : null,
    error_code: error ? (error.code || null) : null
  };

  logger.info({ printJobId, status, attemptNumber, payload }, `📤 Notificando WRAPPER_API: ${status}`);

  try {
    const res = await fetch(`${CONFIG.API_WEBHOOK_URL}/v1/print-jobs/${printJobId}/ack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.PRINTER_WRAPPER_TOKEN}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000) // 10s timeout
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      logger.error({ status: res.status, data }, "WRAPPER_API devolvió error");
      return { success: false, status: res.status, data };
    }

    logger.debug({ printJobId }, "✅ WRAPPER_API notificado correctamente");
    return { success: true, data };
  } catch (err) {
    logger.error({ err, printJobId }, "❌ Error técnico notificando WRAPPER_API");
    return { success: false, error: err.message };
  }
}

module.exports = { 
  notifyPrintJobStatus, 
  PRINT_JOB_STATUSES
};
