const dotenv = require("dotenv");

dotenv.config();

const GLOBAL_CONFIG = {
  AMQP_URL: process.env.AMQP_URL, 
  QUEUE_PREFIX: "print_records.queue",
  PRINT_EXCHANGE: "print_records",
  DLX_EXCHANGE: "print_records.dlx",
  RETRY_EXCHANGE: "print_records.retry",
  POS_API_URL: process.env.POS_API_URL,
  RB_SERVICE_URL: process.env.RB_SERVICE_URL,
  PRINTER_WRAPPER_TOKEN: process.env.PRINTER_WRAPPER_TOKEN,
  API_WEBHOOK_URL: process.env.API_WEBHOOK_URL,
  
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "5", 10),
  PREFETCH: parseInt(process.env.PREFETCH || "1", 10),
};

const CONFIG = {
  ...GLOBAL_CONFIG,
  STORE_ID: process.env.STORE_ID,
  STORE_ALIAS: process.env.STORE_ALIAS,
};

// Variables dependientes del STORE_ID
if (CONFIG.STORE_ID) {
    CONFIG.QUEUE_NAME = `${CONFIG.QUEUE_PREFIX}:${CONFIG.STORE_ID}`;
    CONFIG.DLX_QUEUE_NAME = `${CONFIG.QUEUE_PREFIX}.dlx:${CONFIG.STORE_ID}`;
    CONFIG.RETRY_QUEUE_NAME = `${CONFIG.QUEUE_PREFIX}.retry:${CONFIG.STORE_ID}`;
}

// Validación simplificada
if (!CONFIG.AMQP_URL) {
  throw new Error("❌ Falta AMQP_URL. Verifique que el servicio systemd lo esté inyectando.");
}

if (!CONFIG.STORE_ID) {
  throw new Error("❌ Falta STORE_ID en .env");
}

module.exports = { CONFIG };