import { initAMQP } from "./amqpClient.js";
import { processMessage } from "./worker.js";
import { logger } from "./utils.js";

(async () => {
  try {
    await initAMQP(processMessage);
    logger.info("Wrapper AMQP iniciado 🚀");
  } catch (err) {
    logger.error({ err }, "Error al iniciar wrapper");
    process.exit(1);
  }
})();
