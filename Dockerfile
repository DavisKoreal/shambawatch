# Shamba Watch 2.0 — Telemetry Ingestion Bridge Container
# Deployable to Google Cloud Run, Render, Railway, Fly.io, or Koyeb (Free Tier)

FROM node:22-alpine

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install production dependencies (mqtt, etc.)
RUN npm ci --only=production

# Copy application source code
COPY . .

# Environment Defaults
ENV NODE_ENV=production
ENV FIREBASE_PROJECT_ID=shambawatch
ENV MQTT_BROKER_URL=mqtt://backend.teleops.io
ENV MQTT_TOPIC=lorawan-server-uplink/#

# Run 24/7 MQTT Ingestion Bridge Daemon
CMD ["node", "scripts/mqtt_ingestion_bridge.js"]
