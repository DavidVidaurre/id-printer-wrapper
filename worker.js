import { apiClient } from "./apiClient.js";
import { logger } from "./utils.js";

export async function processMessage(job) {
  logger.info({ job }, "Procesando mensaje");

  try {
    const result = await apiClient.sendToRbService(job);
    logger.info({ result }, "Mensaje procesado correctamente");

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
