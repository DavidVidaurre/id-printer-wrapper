import amqp from "amqplib";
import { CONFIG } from "./config.js";

async function publish() {
  const conn = await amqp.connect(CONFIG.AMQP_URL);
  const channel = await conn.createChannel();

  const escPos = `\u001b@\u001d!\u0000Doc: bI8CHkzSoHyMJWab  |  \u001bE\u0001LW Almacen 01\u001bE\u0000
Impreso: 30/09/25 06:37:19 PM

\u001d!\u0010\u001ba\u0001DEMO [OV-001538]
\u001ba\u0000\u001d!\u0000\u001b!\u0000\u001d!\u0000\u001ba\u0001------------------------------------------------
\u001ba\u0000Aplicativos web     Items       30 Sep 25       
\u001d!\u0011Delivery  1     06:25PM 
\u001b!\u0000\u001d!\u0000\u001ba\u0001------------------------------------------------
\u001ba\u0000\u001d!\u0010\u001b!\b\u001d!\u0010N  de orden: 2106321883
\u001b!\u0000\u001d!\u0000\u001b!\u0000\u001d!\u0000\u001ba\u0001------------------------------------------------
\u001ba\u0000\u001b!\b\u001d!\u00111x Desayuno Nevero
\u001d!\u0000\u001b!\u0000\u001b!\u0000\u001d!\u0010  1x Chicken salad sandwich fit
\u001d!\u0000\u001b!\u0000\u001d!\u0010  1x Jugo de pina
\u001d!\u0000\u001b!\u0000\u001d!\u0000\u001ba\u0001------------------------------------------------
\u001ba\u0000\u001dVA\u0003\u001bB\u0001
`;


  // mensaje de prueba
  const payload = {
    host: "192.168.100.18",
    port: "9100",
    content: escPos
  };

  channel.sendToQueue(CONFIG.QUEUE_NAME, Buffer.from(JSON.stringify(payload), "utf-8"), {
    persistent: true
  });

  console.log("📤 Mensaje enviado:", payload);

  await channel.close();
  await conn.close();
}

function escapeForJson(str) {
  return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
    return "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
  });
}


publish().catch(console.error);

// Hacer print de prueba con varias peticiones para probar concurrencia y performance
// for (let i = 0; i < 10; i++) {
//   publish().catch(console.error);
// }
