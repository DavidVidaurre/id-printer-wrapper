/**
 * Procesa un mensaje de impresión proveniente de AMQP.
 * Decide la estrategia: rb-service (network) o impresión local (usb).
 */
const { print, checkPrinterStatus } = require("./printerClient.js");
const { apiClient } = require("./apiClient.js");
const { logger } = require("./utils.js");
const { notifyPrintJobStatus, PRINT_JOB_STATUSES } = require("./webhookClient.js");

async function processMessage(job, retryCount = 0) {
  const printJobId = job.print_job_uuid;
  
  if (!printJobId) {
    logger.error({ job }, "❌ Mensaje sin print_job_uuid, ignorando");
    return { success: false, error: new Error("Missing print_job_uuid") };
  }
  
  logger.info({ printJobId, job, retryCount }, "📥 Procesando mensaje");

  try {
    const type = job?.type || "network";
    let result;

    if (type === "usb") {
      logger.info({ printJobId }, "Estrategia: Impresión USB local");
      const printerStatus = await checkPrinterStatus({ type });
      logger.info({ printJobId, printerStatus }, "Estado de la impresora USB verificado");

      if (!printerStatus.status?.online || !printerStatus.status?.ready) {
        throw new Error(`Impresora USB no disponible: ${printerStatus.message}`);
      }

      await print({ type, content: job.content });
      
      result = {
        status: { online: true, ready: true },
        message: "Impresión USB completada exitosamente"
      };
    } else {
      logger.info({ printJobId }, "Estrategia: Impresión vía rb-service (network)");
      result = await apiClient.sendToRbService(job);
      logger.info({ printJobId, result }, "Respuesta del rb-service recibida");
    }

    if (result?.status?.online && result?.status?.ready) {
      await notifyPrintJobStatus({
        printJobId,
        status: PRINT_JOB_STATUSES.SUCCESS,
        attemptNumber: retryCount + 1,
      });
      
      logger.info({ printJobId }, "✅ Impresión exitosa");
      return { success: true, printJobId };
    } else {
      const errorMsg = result?.message || "Impresora no disponible";
      
      await notifyPrintJobStatus({
        printJobId,
        status: PRINT_JOB_STATUSES.FAILED,
        attemptNumber: retryCount + 1,
        error: new Error(errorMsg)
      });
      
      logger.warn({ printJobId, errorMsg }, "⚠️ Fallo lógico de impresión");
      return { success: false, error: new Error(errorMsg), printJobId };
    }
  } catch (err) {
    logger.error({ printJobId, err }, "❌ Error técnico procesando impresión");
    
    await notifyPrintJobStatus({
      printJobId,
      status: PRINT_JOB_STATUSES.FAILED,
      attemptNumber: retryCount + 1,
      error: err
    });

    return { success: false, error: err, printJobId };
  }
}

module.exports = { processMessage };
