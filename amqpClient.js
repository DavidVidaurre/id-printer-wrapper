import amqp from "amqp-connection-manager";
import { CONFIG } from "./config.js";
import { logger } from "./utils.js";

let channelWrapper;

export function initAMQP(onMessage) {
  logger.info("Conectando a RabbitMQ...");

  const connection = amqp.connect([CONFIG.AMQP_URL], {
    reconnectTimeInSeconds: 5,
  });

  connection.on("connect", () => logger.info("✅ Conectado a RabbitMQ"));
  connection.on("disconnect", (err) =>
    logger.error({ err }, "❌ Desconectado de RabbitMQ, reintentando...")
  );

  channelWrapper = connection.createChannel({
    json: false,
    setup: async (channel) => {
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
          "x-message-ttl": 600000, // opcional: mensajes expiran en 10 minutos (600000 ms)
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
    },
  });
}

async function handleRetryOrDLX(channel, content, retries, msg, err) {
  if (retries < CONFIG.MAX_RETRIES) {
    const delay = Math.pow(2, retries) * 5000; // 5s, 10s, 20s...
    logger.warn({ delay, err }, `Reintentando mensaje (intento #${retries + 1})`);

    // Publish to delayed exchange using routing key = queue name
    channel.publish(
      CONFIG.RETRY_EXCHANGE,
      CONFIG.QUEUE_NAME,
      Buffer.from(JSON.stringify(content)),
      {
        headers: { "x-delay": delay, "x-retries": retries + 1 },
        persistent: true,
      }
    );
  } else {
    logger.error({ err }, "Max retries alcanzados → enviando a DLX");
    // Publish to DLX exchange; DLX exchange direct -> DLX queue por tienda recibirá el mensaje
    channel.publish(CONFIG.DLX_EXCHANGE, CONFIG.DLX_QUEUE_NAME, Buffer.from(JSON.stringify(content)), {
      persistent: true,
    });
  }

  // siempre ackear el mensaje original para evitar duplicados
  channel.ack(msg);
}
