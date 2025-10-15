import { CONFIG } from "./config.js";
import { logger } from "./utils.js";

export const apiClient = {
  async sendToRbService(payload) {
    const url = `${CONFIG.RB_SERVICE_URL}/printer/print`;
    logger.info({ url }, "Llamando rb-service");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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
  }
};
