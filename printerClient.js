/**
 * printerClient.js
 * 
 * Módulo para manejar impresiones directas (TCP y USB) desde Node.js.
 * Reemplaza al rb-service, sin depender de servicios externos.
 */

const escpos = require("@node-escpos/core");
const escposNetwork = require("@node-escpos/network-adapter");
const escposUsb = require("@node-escpos/usb-adapter");
const net = require("net");

// Asignar adaptadores al namespace de escpos
escpos.Network = escposNetwork;
escpos.USB = escposUsb;

function decodeEscPosString(str) {
  // Convierte \u001b a caracteres reales ESC/POS
  return Buffer.from(
    str.replace(/\\u([0-9a-fA-F]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16))),
    "binary"
  );
}

/**
 * Imprime en una impresora de red (TCP, puerto 9100).
 * @param {Object} options
 * @param {string} options.printerIp - IP de la impresora
 * @param {number} [options.printerPort=9100] - Puerto TCP
 * @param {Buffer|string} options.content - Contenido en ESC/POS o texto plano
 */
async function printToNetworkPrinter({ printerIp, printerPort = 9100, content }) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const data = Buffer.isBuffer(content)
      ? content
      : decodeEscPosString(content);

    client.connect(printerPort, printerIp, () => {
      console.log(`🖨️ Conectado a impresora de red: ${printerIp}:${printerPort}`);
      client.write(data, () => {
        console.log("✅ Datos enviados a la impresora");
        client.end();
        resolve();
      });
    });

    client.on('error', (err) => {
      console.error(`❌ Error de impresión (TCP): ${err.message}`);
      client.destroy();
      reject(err);
    });

    client.on('close', () => {
      console.log("🔌 Conexión cerrada con la impresora");
    });
  });
}

/**
 * Imprime en una impresora USB conectada al Raspberry o Windows.
 * @param {string|Buffer} content - Contenido ESC/POS o texto
 */
async function printToUsbPrinter(content) {
  try {
    const device = new escpos.USB();
    const data = Buffer.isBuffer(content) 
      ? content 
      : decodeEscPosString(content);

    return new Promise((resolve, reject) => {
      device.open((err) => {
        if (err) return reject(err);

        const printer = new escpos.Printer(device, {
          encoding: 'GB18030' // Configuración de encoding por defecto
        });

        // Escribir los datos directamente como Buffer
        device.write(data, (writeErr) => {
          if (writeErr) {
            console.error("❌ Error escribiendo a USB:", writeErr.message);
            device.close();
            return reject(writeErr);
          }

          console.log("✅ Impresión USB completada");
          device.close();
          resolve();
        });
      });
    });
  } catch (error) {
    console.error("❌ Error de impresión USB:", error.message);
    throw error;
  }
}

/**
 * Detección automática según el tipo de impresora.
 * @param {Object} options
 * @param {('network'|'usb')} options.type - Tipo de conexión
 * @param {string} [options.printerIp]
 * @param {number} [options.printerPort]
 * @param {Buffer|string} options.content
 */
async function print({ type = 'network', printerIp, printerPort, content }) {
  if (type === 'network') {
    return printToNetworkPrinter({ printerIp, printerPort, content });
  } else if (type === 'usb') {
    return printToUsbPrinter(content);
  } else {
    throw new Error(`Tipo de impresora no soportado: ${type}`);
  }
}

/**
 * Verifica el estado de una impresora de red (TCP).
 * @param {Object} options
 * @param {string} options.printerIp - IP de la impresora
 * @param {number} [options.printerPort=9100] - Puerto TCP
 * @param {number} [options.timeout=5000] - Timeout en milisegundos
 * @returns {Promise<Object>} Estado de la impresora
 */
async function checkNetworkPrinterStatus({ printerIp, printerPort = 9100, timeout = 5000 }) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    const startTime = Date.now();
    
    const timer = setTimeout(() => {
      client.destroy();
      resolve({
        status: { online: false, ready: false },
        message: `Timeout alcanzado (${timeout}ms)`,
        ip: printerIp,
        port: printerPort,
        responseTime: null
      });
    }, timeout);

    client.connect(printerPort, printerIp, () => {
      const responseTime = Date.now() - startTime;
      clearTimeout(timer);
      client.end();
      resolve({
        status: { online: true, ready: true },
        message: 'Impresora disponible',
        ip: printerIp,
        port: printerPort,
        responseTime: `${responseTime}ms`
      });
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      client.destroy();
      resolve({
        status: { online: false, ready: false },
        message: err.message,
        ip: printerIp,
        port: printerPort,
        responseTime: null,
        error: err.code
      });
    });
  });
}

/**
 * Verifica el estado de las impresoras USB conectadas.
 * @returns {Promise<Object>} Estado de las impresoras USB
 */
async function checkUsbPrinterStatus() {
  try {
    const devices = escpos.USB.findPrinter();
    
    if (!devices || devices.length === 0) {
      return {
        // status: 'offline',
        status: {
          online: false,
          ready: false
        },
        message: 'No se encontraron impresoras USB',
        devices: []
      };
    }

    const deviceStatus = [];
    
    for (const device of devices) {
      try {
        const usbDevice = new escpos.USB(device.vendorId, device.productId);
        
        await new Promise((resolve, reject) => {
          usbDevice.open((err) => {
            if (err) {
              deviceStatus.push({
                vendorId: device.vendorId,
                productId: device.productId,
                manufacturer: device.manufacturer || 'Desconocido',
                product: device.product || 'Impresora USB',
                status: { error: true },
                message: err.message,
                error: err.code
              });
              return reject(err);
            }

            deviceStatus.push({
              vendorId: device.vendorId,
              productId: device.productId,
              manufacturer: device.manufacturer || 'Desconocido',
              product: device.product || 'Impresora USB',
              status: { online: true, ready: true },
              message: 'Impresora USB disponible'
            });

            usbDevice.close();
            resolve();
          });
        });
      } catch (error) {
        deviceStatus.push({
          vendorId: device.vendorId,
          productId: device.productId,
          manufacturer: device.manufacturer || 'Desconocido',
          product: device.product || 'Impresora USB',
          status: { error: true },
          message: error.message
        });
      }
    }

    return {
      status: {
        online: deviceStatus.some(d => d.status.online),
        ready: deviceStatus.every(d => d.status.ready)
      },
      message: `${deviceStatus.length} impresora(s) USB encontrada(s)`,
      devices: deviceStatus
    };

  } catch (error) {
    return {
      status: {
        online: false,
        ready: false
      },
      message: `Error verificando impresoras USB: ${error.message}`,
      devices: []
    };
  }
}

/**
 * Verifica el estado de una impresora según el tipo.
 * @param {Object} options
 * @param {('network'|'usb')} options.type - Tipo de conexión
 * @param {string} [options.printerIp] - IP de la impresora (para network)
 * @param {number} [options.printerPort] - Puerto TCP (para network)
 * @param {number} [options.timeout] - Timeout en milisegundos
 * @returns {Promise<Object>} Estado de la impresora
 */
async function checkPrinterStatus({ type = 'network', printerIp, printerPort, timeout }) {
  if (type === 'network') {
    if (!printerIp) {
      throw new Error('IP de la impresora es requerida para verificar estado de red');
    }
    return checkNetworkPrinterStatus({ printerIp, printerPort, timeout });
  } else if (type === 'usb') {
    return checkUsbPrinterStatus();
  } else {
    throw new Error(`Tipo de impresora no soportado: ${type}`);
  }
}

module.exports = { print, checkPrinterStatus };