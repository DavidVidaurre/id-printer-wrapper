// errorTranslator.js
function errorTranslator(err) {
  // ---------------------------
  // 1) Timeout o AbortSignal
  // ---------------------------
  if (err.name === "TimeoutError" || err.code === 23 || err.name === "AbortError") {
    return {
      type: "timeout",
      message: "El servicio no respondió dentro del tiempo esperado.",
      original: err
    };
  }

  // -------------------------------------------------
  // 2) ECONNREFUSED → servicio caído / puerto cerrado
  // -------------------------------------------------
  if (err.cause?.code === "ECONNREFUSED" || err.code === "ECONNREFUSED") {
    return {
      type: "connection_refused",
      message: "No se pudo conectar al servicio. Puede estar apagado o inaccesible.",
      original: err
    };
  }

  // -------------------------------------
  // 3) ENOTFOUND → host inválido / DNS
  // -------------------------------------
  if (err.code === "ENOTFOUND") {
    return {
      type: "dns_not_found",
      message: "El dominio o IP del servicio no existe o no fue encontrado.",
      original: err
    };
  }

  // --------------------------------------
  // 4) EHOSTUNREACH → red caída / firewall
  // --------------------------------------
  if (err.code === "EHOSTUNREACH") {
    return {
      type: "host_unreachable",
      message: "El servicio está inalcanzable. Puede haber un problema de red.",
      original: err
    };
  }

  // ---------------------------------
  // 5) ECONNRESET → conexión cortada
  // ---------------------------------
  if (err.code === "ECONNRESET") {
    return {
      type: "connection_reset",
      message: "La conexión con el servicio fue interrumpida inesperadamente.",
      original: err
    };
  }

  // ------------------------------------------------------------
  // 6) Otros errores no catalogados → se devuelven genéricos
  // ------------------------------------------------------------
  return {
    type: "unknown_error",
    message: err.message || "Ocurrió un error desconocido al contactar el servicio.",
    original: err
  };
}

module.exports = { errorTranslator };
