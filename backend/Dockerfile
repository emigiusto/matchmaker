FROM node:20-slim

# Install Chromium and required system libraries for Puppeteer
RUN apt-get update && apt-get install -y \
  chromium \
  wget \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgdk-pixbuf2.0-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxrandr2 \
  xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# Use system Chromium instead of Puppeteer's bundled download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Generate Prisma client (no DB needed at build time)
COPY prisma ./prisma
RUN npx prisma generate

# Build TypeScript
COPY . .
RUN npm run build

EXPOSE 3000

# Run DB migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
