# syntax=docker/dockerfile:1
# Imagen del cliente web de UCO Kudos (ADR-0016).
#
# **Esta imagen no sirve nada: solo transporta archivos.** El cliente es un montón de archivos
# estáticos, y quien los sirve es el proxy inverso, que ya existe y ya gestiona HTTPS. Meter aquí
# un segundo servidor web sería otro proceso que mantener, otra superficie que escanear y otro
# sitio donde configurar cabeceras que ya están configuradas una vez.
#
# El contenedor arranca, copia su contenido al volumen compartido y termina.
ARG NODE=node:22.21.1-alpine
ARG BASE=busybox:1.37.0-musl

FROM ${NODE} AS compilacion
WORKDIR /src

# Primero el manifiesto: la instalación queda en caché mientras no cambien las dependencias.
COPY package.json package-lock.json ./

# `npm ci` instala exactamente lo del archivo de bloqueo. Con `install`, la imagen podría llevar
# versiones distintas de las que se probaron, que es la forma más silenciosa de romper algo.
RUN npm ci

COPY . .

# Las variables del cliente se fijan al construir, porque acaban dentro de los archivos. Ninguna es
# secreta: todo lo que va al navegador es público por definición (ver .env.example).
ARG VITE_IDENTIDAD_EMISOR=""
ARG VITE_IDENTIDAD_CLIENTE=""
ARG VITE_IDENTIDAD_AUDIENCIA=""
ENV VITE_IDENTIDAD_EMISOR=${VITE_IDENTIDAD_EMISOR} \
    VITE_IDENTIDAD_CLIENTE=${VITE_IDENTIDAD_CLIENTE} \
    VITE_IDENTIDAD_AUDIENCIA=${VITE_IDENTIDAD_AUDIENCIA}

RUN npm run build

# El presupuesto de peso también se comprueba aquí, no solo en el pipeline: así una imagen que
# incumple QA-MOV-01 no llega a existir.
RUN node scripts/presupuesto-de-peso.mjs

FROM ${BASE} AS web
ARG VERSION=0.0.0-local
ARG REVISION=local
LABEL org.opencontainers.image.title="ucokudos-web" \
      org.opencontainers.image.description="Cliente web mobile first de UCO Kudos" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

COPY --from=compilacion /src/dist /dist

# Por si alguien la arranca a mano sin el comando del compose: deja claro para qué sirve en lugar
# de quedarse en silencio.
CMD ["sh", "-c", "echo 'Esta imagen solo transporta los archivos del cliente. Usar el compose.' && ls /dist"]
