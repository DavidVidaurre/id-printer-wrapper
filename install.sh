#!/bin/bash

# --- CONFIGURACIÓN QUE USTED DEBE DEFINIR ---
GIT_REPO="https://github.com/DavidVidaurre/id-printer-wrapper.git" # O la URL de su servidor
VERSION_TAG="v1.4.1" # La etiqueta de la versión estable
SERVICE_NAME="wrapper-amqp"
INSTALL_DIR="/opt/$SERVICE_NAME"
# ---------------------------------------------

# Verificar si se ejecuta con root
if [ "$(id -u)" != "0" ]; then
   echo "Este script debe ejecutarse con 'sudo'."
   exit 1
fi

echo "=========================================================="
echo "          Instalador del Wrapper AMQP $VERSION_TAG        "
echo "=========================================================="

# 1. Solicitar STORE_ID y ALIAS de forma interactiva
read -p "Ingrese el STORE_ID (obligatorio): " STORE_ID </dev/tty
if [ -z "$STORE_ID" ]; then
    echo "❌ El STORE_ID no puede estar vacío. Abortando."
    exit 1
fi

read -p "Ingrese un ALIAS para esta tienda (ej. Tienda Principal): " STORE_ALIAS </dev/tty
if [ -z "$STORE_ALIAS" ]; then
    echo "⚠️  No se ingresó un alias, se usará 'SinAlias'."
    STORE_ALIAS="SinAlias"
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

# 5. CREA EL ARCHIVO .ENV CON EL STORE_ID Y STORE_ALIAS
echo "Creando archivo .env con STORE_ID: $STORE_ID y STORE_ALIAS: $STORE_ALIAS"
cat <<EOF > $INSTALL_DIR/.env
STORE_ID=$STORE_ID
STORE_ALIAS="$STORE_ALIAS"
EOF

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