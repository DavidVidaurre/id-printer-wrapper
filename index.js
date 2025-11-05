const { initAMQP } = require("./amqpClient.js");
const { processMessage } = require("./worker.js");
const { logger } = require("./utils.js");

// Manejadores globales de errores para mejor debugging
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "❌ Excepción no capturada");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise }, "❌ Promesa rechazada no manejada");
  process.exit(1);
});

process.on("SIGTERM", () => {
  logger.info("🛑 Recibida señal SIGTERM, cerrando wrapper...");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("🛑 Recibida señal SIGINT, cerrando wrapper...");
  process.exit(0);
});

(async () => {
  try {
    const connection = await initAMQP(processMessage);
    logger.info("Wrapper AMQP iniciado 🚀");
    
    // Mantener el proceso vivo
    process.on("SIGTERM", () => {
      logger.info("🛑 Cerrando conexión AMQP...");
      connection.close();
    });
  } catch (err) {
    logger.error({ err }, "Error al iniciar wrapper");
    process.exit(1);
  }
})();
