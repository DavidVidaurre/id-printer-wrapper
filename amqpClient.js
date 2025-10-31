// import amqp from "amqp-connection-manager";
// import { CONFIG } from "./config.js";
// import { logger } from "./utils.js";

const amqp = require("amqp-connection-manager");
const { CONFIG } = require("./config.js");
const { logger, WRAPPER_STATUSES } = require("./utils.js");
const { apiClient } = require("./apiClient.js");

let channelWrapper;
let lastConnectionStatus = null; // Estado previo de la conexión

function initAMQP(onMessage) {
  logger.info("Conectando a LavinMQ...");

  const connection = amqp.connect([CONFIG.AMQP_URL], {
    reconnectTimeInSeconds: 5,
    heartbeatIntervalInSeconds: 5,
    findServers: () => [CONFIG.AMQP_URL], // Asegura que siempre intente reconectar a la URL correcta
  });

  connection.on("connect", () => {
    if (lastConnectionStatus !== WRAPPER_STATUSES.CONNECTED) {
      logger.info("✅ Conectado a LavinMQ");
      lastConnectionStatus = WRAPPER_STATUSES.CONNECTED;

      // Notificar webhook que el wrapper se conectó
      apiClient.notifyWrapperStatus(WRAPPER_STATUSES.CONNECTED, {
        message: "Wrapper conectado exitosamente a LavinMQ"
      }).catch(err => {
        logger.error({ err }, "Error notificando conexión al webhook");
      });
    }
  });
  
  connection.on("disconnect", (err) => {
    if (lastConnectionStatus !== WRAPPER_STATUSES.DISCONNECTED) {
      logger.error({ err: err || "Desconocido" }, "❌ Desconectado de LavinMQ, reintentando...");
      lastConnectionStatus = WRAPPER_STATUSES.DISCONNECTED;

      // Notificar webhook que el wrapper se desconectó
      apiClient.notifyWrapperStatus(WRAPPER_STATUSES.DISCONNECTED, {
        message: "Wrapper desconectado de LavinMQ",
        error: err?.message || "Desconocido",
        reconnecting: true
      }).catch(notifyErr => {
        logger.error({ notifyErr }, "Error notificando desconexión al webhook");
      });
    }
  });
  connection.on("connectFailed", (err) => {
    if (lastConnectionStatus !== WRAPPER_STATUSES.ERROR) {
      logger.error({ err }, "❌ Falló conexión a LavinMQ, reintentando en 5s...");
      lastConnectionStatus = WRAPPER_STATUSES.ERROR;

      // Notificar webhook que falló la conexión
      apiClient.notifyWrapperStatus(WRAPPER_STATUSES.ERROR, {
        message: "Falló la conexión inicial a LavinMQ",
        error: err?.message || "Error desconocido",
        retrying: true
      }).catch(notifyErr => {
        logger.error({ notifyErr }, "Error notificando fallo de conexión al webhook");
      });
    }
  });
  connection.on("blocked", (reason) => {
    logger.warn({ reason }, "⚠️ Conexión bloqueada por LavinMQ");
  });
  connection.on("unblocked", () => {
    logger.info("✅ Conexión desbloqueada por LavinMQ");
  });

  channelWrapper = connection.createChannel({
    json: false,
    setup: async (channel) => {
      logger.info("Configurando canal AMQP...");
      
      // Manejo de errores del canal
      channel.on("error", (err) => {
        logger.error({ err }, "❌ Error en canal AMQP");
      });
      
      channel.on("close", () => {
        logger.warn("⚠️ Canal AMQP cerrado, será recreado automáticamente");
      });

      // 1) Exchange principal (direct)
      await channel.assertExchange(CONFIG.PRINT_EXCHANGE, "direct", { durable: true });

      // 2) Retry exchange (delayed plugin compatible)
      await channel.assertExchange(CONFIG.RETRY_EXCHANGE, "x-delayed-message", {
        durable: true,
        arguments: { "x-delayed-type": "direct" },
      });

      // 3) DLX exchange (direct) y DLX queue por tienda
      await channel.assertExchange(CONFIG.DLX_EXCHANGE, "direct", { durable: true });
      await channel.assertQueue(CONFIG.DLX_QUEUE_NAME, { durable: true });
      await channel.bindQueue(CONFIG.DLX_QUEUE_NAME, CONFIG.DLX_EXCHANGE, CONFIG.DLX_QUEUE_NAME);

      // 4) Cola principal por tienda
      await channel.assertQueue(CONFIG.QUEUE_NAME, {
        durable: true,
        arguments: {
          // si quieres que la cola automáticamente vaya a DLX cuando expire TTL en la cola:
          "x-dead-letter-exchange": CONFIG.DLX_EXCHANGE,
          "x-message-ttl": 600000, // opcional: mensajes expiran en 10 minutos (600000 ms),
          "x-store-alias": CONFIG.STORE_ALIAS || "",
        },
      });

      // 5) Bind: cola principal al exchange normal (publish normal)
      await channel.bindQueue(CONFIG.QUEUE_NAME, CONFIG.PRINT_EXCHANGE, CONFIG.QUEUE_NAME);

      // 6) Bind: cola principal al retry exchange para recibir mensajes retardados
      //     (Publicar a RETRY_EXCHANGE con routing_key = queueName y header x-delay)
      await channel.bindQueue(CONFIG.QUEUE_NAME, CONFIG.RETRY_EXCHANGE, CONFIG.QUEUE_NAME);

      await channel.prefetch(CONFIG.PREFETCH);

      // Consumer
      await channel.consume(CONFIG.QUEUE_NAME, async (msg) => {
        if (!msg) return;

        const content = JSON.parse(msg.content.toString());
        const retries = (msg.properties.headers && msg.properties.headers["x-retries"]) || 0;

        try {
          const result = await onMessage(content);

          if (result.success) {
            channel.ack(msg);
          } else {
            await handleRetryOrDLX(channel, content, retries, msg, result.error);
          }
        } catch (err) {
          logger.error({ err }, "Error inesperado procesando mensaje");
          await handleRetryOrDLX(channel, content, retries, msg, err);
        }
      });
      
      logger.info("✅ Canal AMQP configurado correctamente");
    },
  });

  // Evento adicional para monitorear el estado del canal
  channelWrapper.on("error", (err) => {
    logger.error({ err }, "❌ Error en channelWrapper");
  });

  channelWrapper.on("close", () => {
    logger.warn("⚠️ ChannelWrapper cerrado");
  });

  return connection;
}

async function handleRetryOrDLX(channel, content, retries, msg, err) {
  try {
    if (retries < CONFIG.MAX_RETRIES) {
      const delay = Math.pow(2, retries) * 5000;
      logger.warn({ delay, err }, `Reintentando mensaje (intento #${retries + 1})`);

      // PUBLICACIÓN CONFIRMADA del reintento
      const published = channel.publish(
        CONFIG.RETRY_EXCHANGE,
        CONFIG.QUEUE_NAME,
        Buffer.from(JSON.stringify(content)),
        {
          headers: { "x-delay": delay, "x-retries": retries + 1 },
          persistent: true,
        }
      );

      if (published) {
        logger.debug(`✅ Reintento #${retries + 1} programado correctamente`);
        channel.ack(msg); // SOLO ACK si el reintento se publicó bien
      } else {
        logger.error("❌ Falló la publicación del reintento - NO se hace ACK");
        channel.nack(msg, false, true); // Requeue el mensaje original
      }

    } else {
      logger.error({ err }, "Max retries alcanzados → enviando a DLX");
      
      // PUBLICACIÓN CONFIRMADA a DLX
      const published = channel.publish(
        CONFIG.DLX_EXCHANGE, 
        CONFIG.DLX_QUEUE_NAME, 
        Buffer.from(JSON.stringify(content)),
        { persistent: true }
      );

      if (published) {
        logger.debug("✅ Mensaje enviado a DLX correctamente");
        channel.ack(msg);
      } else {
        logger.error("❌ Falló publicación a DLX - NO se hace ACK");
        channel.nack(msg, false, true);
      }
    }
  } catch (publishErr) {
    logger.error({ err: publishErr }, "Error en handleRetryOrDLX - NO se hace ACK");
    channel.nack(msg, false, true); // Requeue en caso de error
  }
}

module.exports = { initAMQP };