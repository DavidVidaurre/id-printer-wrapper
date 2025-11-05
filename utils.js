const pino = require("pino");

const logger = pino({
  level: "info",
  transport: { target: "pino-pretty" }
});

const WRAPPER_STATUSES = {
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  ERROR: "error"
};

module.exports = { logger, WRAPPER_STATUSES };
