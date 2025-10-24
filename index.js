// import { initAMQP } from "./amqpClient.js";
// import { processMessage } from "./worker.js";
// import { logger } from "./utils.js";

const { initAMQP } = require("./amqpClient.js");
const { processMessage } = require("./worker.js");
const { logger } = require("./utils.js");

(async () => {
  try {
    await initAMQP(processMessage);
    logger.info("Wrapper AMQP iniciado 🚀");
  } catch (err) {
    logger.error({ err }, "Error al iniciar wrapper");
    process.exit(1);
  }
})();
