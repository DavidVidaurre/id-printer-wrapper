const { CONFIG } = require("./config.js");
const { errorTranslator } = require("./errorTranslator.js");
const { logger } = require("./utils.js");

const apiClient = {
  async sendToRbService(payload) {
    const url = `${CONFIG.RB_SERVICE_URL}/printer/print`;
    logger.info({ url }, "Llamando rb-service");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      logger.info({ result }, "Respuesta del rb-service");

      return result;
    } catch (err) {
      const translated  = errorTranslator(err);
      logger.error({ err: translated }, "Error técnico llamando rb-service");
      throw translated;
    }
  },

  async notifyWrapperStatus(status, details = {}) {
    if (!CONFIG.API_WEBHOOK_URL) {
      logger.debug("API_WEBHOOK_URL no configurada, saltando notificación de estado");
      return { success: true };
    }

    const payload = {
      store_uuid: CONFIG.STORE_ID,
      alias: CONFIG.STORE_ALIAS || null,
      status: status, // 'connected', 'disconnected', 'error'
      os: process.platform,
      message: details.message || null,
      error: details.error || null,
      metadata: {
        reconnecting: details.reconnecting || false,
        retrying: details.retrying || false,
      }
    };

    logger.info({ payload }, `Notificando estado del wrapper: ${status}`);

    try {
      const res = await fetch(`${CONFIG.API_WEBHOOK_URL}/v1/webhook/wrapper/status`, {
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
        logger.error({ status: res.status, data }, "Webhook devolvió error");
        return { success: false, status: res.status, data };
      }

      logger.debug("Webhook notificado correctamente");
      return { success: true, data };
    } catch (err) {
      logger.error({ err }, "Error técnico notificando webhook");
      return { success: false, error: err.message };
    }
  }
};

module.exports = { apiClient };
