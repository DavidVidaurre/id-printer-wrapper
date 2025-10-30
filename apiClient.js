// import { CONFIG } from "./config.js";
// import { logger } from "./utils.js";

const { CONFIG } = require("./config.js");
const { logger } = require("./utils.js");

const apiClient = {
  async sendToRbService(payload) {
    const url = `${CONFIG.RB_SERVICE_URL}/printer/print`;
    logger.info({ url }, "Llamando rb-service");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000) // 15s timeout
    });

    if (!res.ok) {
      throw new Error(`rb-service error ${res.status}`);
    }
    return await res.json();
  },

  async notifyPOS(payload) {
    return { success: true };

    const url = `${CONFIG.POS_API_URL}/printer/acknowledge`;
    logger.info({ url }, "Notificando a POS API");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CONFIG.PRINTER_WRAPPER_TOKEN}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        logger.error({ status: res.status, data }, "POS API devolvió error");
        return { success: false, status: res.status, data };
      }

      return { success: true, data };
    } catch (err) {
      logger.error({ err }, "Error técnico notificando POS API");
      return { success: false, error: err.message };
    }
  },

  async notifyWrapperStatus(status, details = {}) {
    if (!CONFIG.WRAPPER_WEBHOOK_URL) {
      logger.debug("WRAPPER_WEBHOOK_URL no configurada, saltando notificación de estado");
      return { success: true };
    }

    const payload = {
      store_uuid: CONFIG.STORE_ID,
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
      const res = await fetch(CONFIG.WRAPPER_WEBHOOK_URL, {
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
