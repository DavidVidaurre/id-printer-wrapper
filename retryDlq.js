import amqp from "amqplib";
import { CONFIG } from "./config.js";
import { logger } from "./utils.js";

async function retryDLQ() {
  logger.info("Conectando a RabbitMQ para reintento DLX...");

  const conn = await amqp.connect(CONFIG.AMQP_URL);
  const channel = await conn.createChannel();

  await channel.assertQueue(CONFIG.DLX_NAME, { durable: true });

  // Consume un mensaje del DLX
  const msg = await channel.get(CONFIG.DLX_NAME, { noAck: false });
  if (msg) {
    const content = JSON.parse(msg.content.toString());
    logger.info({ content }, "Reinyectando mensaje desde DLX");

    // Volver a enviar a la cola principal
    channel.sendToQueue(CONFIG.QUEUE_NAME, Buffer.from(JSON.stringify(content)), { persistent: true });

    channel.ack(msg);
  } else {
    logger.info("No hay mensajes en DLX");
  }

  await channel.close();
  await conn.close();
}

retryDLQ().catch((err) => {
  logger.error({ err }, "Error en reintento DLX");
  process.exit(1);
});
