// import { apiClient } from "./apiClient.js";
// import { logger } from "./utils.js";

/**
 * Procesa un mensaje de impresión proveniente de AMQP.
 * Decide la estrategia: rb-service (network) o impresión local (usb).
 */
const { print, checkPrinterStatus } = require("./printerClient.js");
const { apiClient } = require("./apiClient.js");
const { logger } = require("./utils.js");

async function processMessage(job) {
  logger.info({ job }, "Procesando mensaje");

  try {
    const type = job?.type || "network";
    let result;

    if (type === "usb") {
      // Impresión local vía USB
      logger.info("Estrategia: Impresión USB local");
      const printerStatus = await checkPrinterStatus({ type });
      logger.info({ printerStatus }, "Estado de la impresora USB verificado");

      if (!printerStatus.status?.online || !printerStatus.status?.ready) {
        throw new Error(`Impresora USB no disponible: ${printerStatus.message}`);
      }

      await print({ type, content: job.content });
      
      result = {
        status: { online: true, ready: true }, // La impresión fue exitosa
        message: "Impresión USB completada exitosamente"
      };
    } else {
      // Impresión vía rb-service (network)
      logger.info("Estrategia: Impresión vía rb-service (network)");
      result = await apiClient.sendToRbService(job);
      logger.info({ result }, "Respuesta del rb-service recibida");
    }

    if (result?.status?.online && result?.status?.ready) {
      // ✅ Éxito
      await apiClient.notifyPOS({
        jobId: job.orderId,
        status: "SUCCESS",
        message: result.message || "Impresión exitosa",
      });
      logger.info("POS notificado del éxito");
      return { success: true };
    } else {
      // ⚠️ Fallo lógico
      const errorMsg = result?.message || "Impresora no disponible";
      await apiClient.notifyPOS({
        jobId: job.orderId,
        status: "FAILED",
        error: errorMsg,
      });
      logger.warn({ errorMsg }, "POS notificado del fallo lógico");
      return { success: false, error: new Error(errorMsg) };
    }
  } catch (err) {
    // ⚠️ Error técnico (rb-service caído, red, etc.)
    logger.error({ err }, "Error enviando a rb-service, notificando POS");
    try {
      await apiClient.notifyPOS({ jobId: job.orderId, status: "FAILED", error: err.message });
      logger.info("POS notificado del fallo técnico");
    } catch (errPOS) {
      logger.error({ errPOS }, "Error notificando al POS");
    }

    return { success: false, error: err };
  }
}

module.exports = { processMessage };
