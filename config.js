// import dotenv from "dotenv";
const dotenv = require("dotenv");

dotenv.config();

// Configuración que NO CAMBIA por tienda (Hardcodeada o inyectada por el script/systemd)
const GLOBAL_CONFIG = {
  // Estos valores serán pasados como variables de entorno al servicio systemd,
  // NO desde el .env del cliente.
  AMQP_URL: process.env.AMQP_URL, 
  QUEUE_PREFIX: "print_records.queue", // Fijo
  PRINT_EXCHANGE: "print_records", // Fijo
  DLX_EXCHANGE: "print_records.dlx", // Fijo
  RETRY_EXCHANGE: "print_records.retry", // Fijo
  POS_API_URL: process.env.POS_API_URL,
  RB_SERVICE_URL: process.env.RB_SERVICE_URL,
  PRINTER_WRAPPER_TOKEN: process.env.PRINTER_WRAPPER_TOKEN,
  
  // Parámetros técnicos que pueden depender del entorno o del tipo de mensaje
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "5", 10),
  PREFETCH: parseInt(process.env.PREFETCH || "1", 10),
};

// Configuración que SÍ CAMBIA por tienda (Tomada del .env del cliente)
const CONFIG = {
  ...GLOBAL_CONFIG,
  STORE_ID: process.env.STORE_ID, // ¡ÚNICO valor en el .env!
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