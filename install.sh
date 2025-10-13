#!/bin/bash

# --- CONFIGURACIÓN QUE USTED DEBE DEFINIR ---
GIT_REPO="https://github.com/DavidVidaurre/id-printer-wrapper.git" # O la URL de su servidor
VERSION_TAG="v1.0.4" # La etiqueta de la versión estable
SERVICE_NAME="wrapper-amqp"
INSTALL_DIR="/opt/$SERVICE_NAME"
# ---------------------------------------------

# Verificar si se ejecuta con root
if [ "$(id -u)" != "0" ]; then
   echo "Este script debe ejecutarse con 'sudo'."
   exit 1
fi

echo "=========================================================="
echo "          Instalador del Wrapper AMQP V$VERSION_TAG        "
echo "=========================================================="

# 1. OBTENER EL STORE_ID DEL ARGUMENTO
STORE_ID="$1" # El primer argumento pasado al script (el STORE_ID)

if [ -z "$STORE_ID" ]; then
    echo "❌ El STORE_ID no puede estar vacío. Abortando. (Uso: curl ... | sudo bash -s -- [STORE_ID])"
    exit 1
fi

# 2. Verificar e instalar dependencias básicas (git, nodejs, npm)
echo "Verificando e instalando dependencias (Node.js, git)..."
apt update
apt install -y nodejs npm git unzip

# 3. Descargar el proyecto desde el repositorio
echo "Descargando el proyecto desde $GIT_REPO..."
if [ -d "$INSTALL_DIR" ]; then
    echo "El directorio $INSTALL_DIR ya existe. Borrando y clonando de nuevo."
    rm -rf $INSTALL_DIR
fi
git clone --branch $VERSION_TAG --depth 1 $GIT_REPO $INSTALL_DIR
if [ $? -ne 0 ]; then
    echo "❌ Error al clonar el repositorio. Verifique la URL y la etiqueta."
    exit 1
fi

# 4. Instalar dependencias de Node
echo "Instalando dependencias de Node.js..."
cd $INSTALL_DIR
npm install

# 5. CREA EL ARCHIVO .ENV CON EL STORE_ID
echo "Creando archivo .env con STORE_ID: $STORE_ID"
echo "STORE_ID=$STORE_ID" > $INSTALL_DIR/.env

# 6. Configurar y habilitar systemd
echo "Copiando archivo de servicio systemd..."
# Asume que el archivo wrapper-amqp.service está en el root del repo clonado
cp $INSTALL_DIR/$SERVICE_NAME.service /etc/systemd/system/

echo "Recargando demonio systemd y habilitando servicio..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME.service

# 7. Limpieza (opcional)
rm -f $INSTALL_DIR/$SERVICE_NAME.service # El archivo original ya está copiado

echo "✅ Instalación de $SERVICE_NAME completada y configurada."
echo "Instrucciones finales:"
echo "1. Inicie el servicio: 'sudo systemctl start $SERVICE_NAME'"
echo "2. Verifique el estado: 'sudo systemctl status $SERVICE_NAME'"