# Usa la imagen base oficial de Node 18 (Bullseye para Debian más actual)
FROM node:20-slim

# Instala librerías del sistema necesarias para:
# - Puppeteer/Chrome Headless (whatsapp-web.js)
# - FFmpeg para procesamiento de audio
# - Otras dependencias comunes
# Instala librerías del sistema, Python3 y Whisper CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    lsof \
    procps \
    net-tools \
    libxkbcommon0 \
    libxkbcommon-x11-0 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm-dev \
    libgbm-dev \
    libglib2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxcursor1 \
    libxss1 \
    libxext6 \
    libxshmfence-dev \
    libasound2 \
    libpangocairo-1.0-0 \
    libxrender1 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    ffmpeg \
    libavcodec-extra \
    python3 python3-venv python3-pip \
 && python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir openai-whisper yt-dlp \
 && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/venv/bin:$PATH"

# Crea y define /app como directorio de trabajo
WORKDIR /app

# Copia los archivos de dependencias para aprovechar la caché
COPY package*.json ./

# Skip Puppeteer download para evitar errores en ARM64
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Instala dependencias con npm (usa npm ci si tienes package-lock.json y quieres instalación limpia)
RUN npm install

# Copia todo tu código al contenedor
COPY . .

# Crea directorio temporal para archivos de audio y uploads
RUN mkdir -p /app/temp && chmod 777 /app/temp
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

# Crea directorio para configuración Next.js si existe
RUN mkdir -p /app/.next && chmod 777 /app/.next

# Variables de entorno para producción
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Expón los puertos necesarios (5001 para AWS ECS)
EXPOSE 5001
EXPOSE 3000

# Copia los scripts de inicio
COPY docker-start.sh /app/
COPY docker-start-robust.sh /app/
COPY docker-start-fast.sh /app/
RUN chmod +x /app/docker-start.sh /app/docker-start-robust.sh /app/docker-start-fast.sh

# Comando de inicio RÁPIDO para evitar circuit breaker
CMD ["./docker-start-fast.sh"]
