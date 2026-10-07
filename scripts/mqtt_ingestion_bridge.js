#!/usr/bin/env node
/**
 * @fileoverview Live LoRaWAN MQTT Telemetry Ingestion Bridge Service for Shamba Watch.
 * 
 * Connects to external LoRaWAN broker (mqtt://backend.teleops.io), listens to lorawan-server-uplink/#,
 * resiliently decodes polymorphic IoT payloads (5FEE hex, Cayenne LPP, pre-decoded JSON, custom WiFi),
 * auto-provisions newly discovered field sensors into Firestore /sensors/{sensorId},
 * and continuously appends immutable timeseries readings to /sensors/{sensorId}/readings.
 * 
 * Usage:
 *   node scripts/mqtt_ingestion_bridge.js --dry-run
 *   node scripts/mqtt_ingestion_bridge.js --limit 5
 *   node scripts/mqtt_ingestion_bridge.js --verbose
 *   node scripts/mqtt_ingestion_bridge.js --devaddr 02010518
 *   node scripts/mqtt_ingestion_bridge.js --emulator
 */

import mqtt from 'mqtt';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { APP_CONFIG, Logger } from '../public/js/config/app-config.js';
import { FIREBASE_CONFIG } from '../public/js/config/firebase-config.js';
import { decodeLoRaMessage } from '../public/js/domain/lorawan-decoder.js';

// ============================================================================
// CLI OPTIONS PARSER
// ============================================================================
const args = process.argv.slice(2);
const options = {
  dryRun: false,
  limit: 0, // 0 = unlimited continuous daemon
  verbose: false,
  filterDevaddr: null,
  emulator: false,
  emulatorHost: 'localhost:8080',
  projectId: process.env.FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId || 'shambawatch',
  brokerUrl: process.env.MQTT_BROKER_URL || APP_CONFIG.MQTT_INGESTION?.BROKER_URL || 'mqtt://backend.teleops.io',
  topic: process.env.MQTT_TOPIC || APP_CONFIG.MQTT_INGESTION?.TOPIC || 'lorawan-server-uplink/#',
  worker: false,
  workerUrl: process.env.WORKER_INGEST_URL || 'https://shamba-watch-proxy.lawyerai.workers.dev/api/telemetry/ingest',
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dry-run') options.dryRun = true;
  else if (arg === '--verbose') options.verbose = true;
  else if (arg === '--limit' && args[i + 1]) options.limit = parseInt(args[++i], 10);
  else if (arg === '--devaddr' && args[i + 1]) options.filterDevaddr = args[++i].toUpperCase();
  else if (arg === '--emulator') options.emulator = true;
  else if (arg === '--project' && args[i + 1]) options.projectId = args[++i];
  else if (arg === '--broker' && args[i + 1]) options.brokerUrl = args[++i];
  else if (arg === '--topic' && args[i + 1]) options.topic = args[++i];
  else if (arg === '--worker') options.worker = true;
  else if (arg === '--worker-url' && args[i + 1]) options.workerUrl = args[++i];
}

console.log('\n============================================================');
console.log('  SHAMBA WATCH — LORAWAN LIVE TELEMETRY INGESTION BRIDGE');
console.log('============================================================');
console.log(`• Broker URL:     ${options.brokerUrl}`);
console.log(`• Topic Filter:   ${options.topic}`);
console.log(`• Target Project: ${options.projectId} (${options.emulator ? 'EMULATOR' : 'PRODUCTION'})`);
console.log(`• Mode:           ${options.dryRun ? 'DRY-RUN (No Database Writes)' : (options.worker ? 'CLOUDFLARE WORKER GATEWAY' : 'LIVE DIRECT FIRESTORE')}`);
if (options.worker) console.log(`• Worker Ingest:  ${options.workerUrl}`);
if (options.limit > 0) console.log(`• Message Limit:  ${options.limit} message(s) then exit`);
if (options.filterDevaddr) console.log(`• DevAddr Filter: ${options.filterDevaddr}`);
console.log('============================================================\n');

// ============================================================================
// FIRESTORE AUTHENTICATION & REST CLIENT
// ============================================================================
let authToken = null;
let tokenExpiresAt = 0;

async function getOrRefreshAuthToken() {
  if (options.emulator) return null;

  const now = Date.now();
  if (authToken && now < (tokenExpiresAt - 120000)) {
    return authToken;
  }

  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const tokens = config.tokens;
    if (!tokens || !tokens.access_token) return null;

    if ((!tokens.access_token || !tokens.expires_at || now > (tokens.expires_at - 120000)) && tokens.refresh_token) {
      if (options.verbose) console.log('[AUTH] Refreshing Firebase OAuth2 access token...');
      const refreshRes = await fetch('https://www.googleapis.com/oauth2/v3/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
          client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        tokens.access_token = refreshData.access_token;
        tokens.expires_at = Date.now() + (refreshData.expires_in * 1000);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        if (options.verbose) console.log('[AUTH] Token refreshed successfully.');
      } else {
        const errJson = await refreshRes.json();
        console.warn('[AUTH] Token refresh request failed:', errJson);
      }
    }

    authToken = tokens.access_token;
    tokenExpiresAt = tokens.expires_at || (Date.now() + 3600000);
    return authToken;
  } catch (err) {
    console.warn('[AUTH] Could not resolve token from firebase-tools.json:', err.message);
    return null;
  }
}

const baseUrl = options.emulator
  ? `http://${options.emulatorHost}/v1/projects/${options.projectId}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${options.projectId}/databases/(default)/documents`;

async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = await getOrRefreshAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// In-memory caches to minimize Firestore roundtrips
const provisionedSensors = new Set();
const lastSensorReadings = new Map();
const recentPacketSignatures = new Map(); // For deduplication

/**
 * Checks and auto-provisions a sensor document in Firestore /sensors/{sensorId}
 */
async function ensureSensorProvisioned(decoded) {
  const sensorId = decoded.sensorId;
  if (provisionedSensors.has(sensorId)) return true;

  if (options.dryRun) {
    provisionedSensors.add(sensorId);
    return true;
  }

  const sensorDocUrl = `${baseUrl}/${APP_CONFIG.FIRESTORE_PATHS.SENSORS_COLLECTION}/${sensorId}`;
  const headers = await getAuthHeaders();

  // Check if sensor exists
  try {
    const checkRes = await fetch(sensorDocUrl, { headers });
    if (checkRes.ok) {
      provisionedSensors.add(sensorId);
      return true;
    }
  } catch (err) {
    // Continue to provision
  }

  // Provision new sensor document matching strict firestore.rules
  const customAttrsMap = {};
  for (const [k, v] of Object.entries(decoded.customAttributes)) {
    customAttrsMap[k] = { stringValue: String(v) };
  }
  customAttrsMap['label'] = { stringValue: 'live field sensor' };
  customAttrsMap['devaddr'] = { stringValue: decoded.deviceId };
  customAttrsMap['provisionedAt'] = { stringValue: new Date().toISOString() };

  const sensorPayload = {
    fields: {
      id: { stringValue: sensorId },
      stationId: { stringValue: decoded.stationId },
      metadata: {
        mapValue: {
          fields: {
            name: { stringValue: `${decoded.stationName} LoRa Moisture Probe` },
            description: { stringValue: `LoRaWAN field telemetry node (DevAddr: ${decoded.deviceId})` },
            sensorType: { stringValue: 'lorawan field sensor' },
            crop: { stringValue: decoded.crop || 'Field Crop' },
            stationId: { stringValue: decoded.stationId },
            stationName: { stringValue: decoded.stationName },
            altitudeMeters: { integerValue: String(decoded.location.altitudeMeters || 1850) },
            minDepthCm: { integerValue: '0' },
            maxDepthCm: { integerValue: '25' },
            location: {
              mapValue: {
                fields: {
                  stationId: { stringValue: decoded.stationId },
                  stationName: { stringValue: decoded.stationName },
                  lat: { doubleValue: decoded.location.lat || -0.2833 },
                  lng: { doubleValue: decoded.location.lng || 36.0667 },
                  altitudeMeters: { integerValue: String(decoded.location.altitudeMeters || 1850) },
                  depthCm: { integerValue: '15' },
                }
              }
            },
            hardware: {
              mapValue: {
                fields: {
                  manufacturer: { stringValue: 'Teleops / LoRaWAN' },
                  model: { stringValue: 'ESP Gateway Node' },
                  serialNumber: { stringValue: decoded.signal.mac || decoded.deviceId },
                  hardwareId: { stringValue: `HW-LORA-${decoded.deviceId}` },
                }
              }
            },
            customAttributes: {
              mapValue: {
                fields: customAttrsMap,
              }
            }
          }
        }
      },
      metricDefinition: {
        mapValue: {
          fields: {
            metricType: { stringValue: decoded.primaryMetric.type || 'moisture' },
            unitSymbol: { stringValue: decoded.primaryMetric.unit || '%' },
            minValid: { integerValue: '0' },
            maxValid: { integerValue: '100' },
            precision: { integerValue: '1' },
          }
        }
      },
      thresholds: {
        mapValue: {
          fields: {
            criticalLow: { integerValue: '20' },
            warningLow: { integerValue: '35' },
            warningHigh: { integerValue: '85' },
            criticalHigh: { integerValue: '95' },
            hysteresis: { integerValue: '2' },
          }
        }
      },
      currentState: {
        mapValue: {
          fields: {
            latestValue: { doubleValue: Number(decoded.primaryMetric.value) },
            lastSampledMs: { integerValue: String(decoded.timestampMs) },
            status: { stringValue: 'nominal' },
            quality: { stringValue: decoded.primaryMetric.quality || 'GOOD' },
            delta: { doubleValue: 0.0 },
            batteryPct: { integerValue: String(decoded.metrics.batteryPct ?? 100) },
          }
        }
      }
    }
  };

  try {
    const provRes = await fetch(sensorDocUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(sensorPayload),
    });

    if (provRes.ok) {
      provisionedSensors.add(sensorId);
      console.log(`[PROVISION] ✅ Auto-provisioned field sensor document: /sensors/${sensorId}`);
      console.log(`            • Station:  ${decoded.stationName} (${decoded.stationId})`);
      console.log(`            • Location: Lat ${decoded.location.lat}, Lng ${decoded.location.lng}`);
      return true;
    } else {
      const errData = await provRes.text();
      console.warn(`[PROVISION] ⚠️ Could not provision /sensors/${sensorId} (HTTP ${provRes.status}):`, errData);
      return false;
    }
  } catch (err) {
    console.warn(`[PROVISION] ⚠️ Exception provisioning /sensors/${sensorId}:`, err.message);
    return false;
  }
}

/**
 * Appends reading to /sensors/{sensorId}/readings and updates parent currentState.
 */
async function ingestReading(decoded) {
  const sensorId = decoded.sensorId;
  const timestampMs = decoded.timestampMs;
  const readingId = `reading_${timestampMs}`;
  const readingUrl = `${baseUrl}/${APP_CONFIG.FIRESTORE_PATHS.SENSORS_COLLECTION}/${sensorId}/${APP_CONFIG.FIRESTORE_PATHS.READINGS_SUBCOLLECTION}/${readingId}`;
  const sensorDocUrl = `${baseUrl}/${APP_CONFIG.FIRESTORE_PATHS.SENSORS_COLLECTION}/${sensorId}`;

  // Calculate delta
  const previousValue = lastSensorReadings.get(sensorId);
  const currentValue = decoded.primaryMetric.value;
  const delta = previousValue !== undefined ? Number((currentValue - previousValue).toFixed(2)) : 0.0;
  lastSensorReadings.set(sensorId, currentValue);

  if (options.dryRun) {
    console.log(`[DRY-RUN] Telemetry Ingested -> Sensor: ${sensorId} | Val: ${currentValue}${decoded.primaryMetric.unit} | Delta: ${delta} | Bat: ${decoded.metrics.batteryPct ?? 'N/A'}% | Schema: ${decoded.schemaType}`);
    return;
  }

  const headers = await getAuthHeaders();

  // 1. Append immutable reading
  const readingPayload = {
    fields: {
      id: { stringValue: readingId },
      sensorId: { stringValue: sensorId },
      timestampMs: { integerValue: String(timestampMs) },
      timestampISO: { stringValue: decoded.timestampISO },
      value: { doubleValue: Number(currentValue) },
      quality: { stringValue: decoded.primaryMetric.quality || 'GOOD' },
      delta: { doubleValue: Number(delta) },
      batteryPct: { integerValue: String(decoded.metrics.batteryPct ?? 100) },
    }
  };

  try {
    const rRes = await fetch(readingUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(readingPayload),
    });

    if (!rRes.ok) {
      const errText = await rRes.text();
      console.warn(`[INGEST] ⚠️ Reading append warning on ${readingId} (HTTP ${rRes.status}):`, errText);
    }
  } catch (err) {
    console.warn(`[INGEST] ⚠️ Reading append exception:`, err.message);
  }

  // 2. Patch parent currentState
  const patchUrl = `${sensorDocUrl}?updateMask.fieldPaths=currentState.latestValue&updateMask.fieldPaths=currentState.lastSampledMs&updateMask.fieldPaths=currentState.delta&updateMask.fieldPaths=currentState.batteryPct&updateMask.fieldPaths=currentState.quality`;
  const currentStatePayload = {
    fields: {
      currentState: {
        mapValue: {
          fields: {
            latestValue: { doubleValue: Number(currentValue) },
            lastSampledMs: { integerValue: String(timestampMs) },
            delta: { doubleValue: Number(delta) },
            batteryPct: { integerValue: String(decoded.metrics.batteryPct ?? 100) },
            quality: { stringValue: decoded.primaryMetric.quality || 'GOOD' },
          }
        }
      }
    }
  };

  try {
    await fetch(patchUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(currentStatePayload),
    });
  } catch (err) {
    // Ignore minor patch failures
  }

  console.log(`[INGEST] ✓ Ingested reading for ${sensorId}: ${currentValue}${decoded.primaryMetric.unit} (Bat: ${decoded.metrics.batteryPct ?? 'N/A'}%, RSSI: ${decoded.signal.rssi ?? 'N/A'}dBm)`);
}

// ============================================================================
// MQTT CONNECTION & STREAM PROCESSING
// ============================================================================
let processedCount = 0;
const clientPrefix = APP_CONFIG.MQTT_INGESTION?.CLIENT_ID_PREFIX || 'shamba_bridge_';
const clientId = `${clientPrefix}${Math.random().toString(16).slice(3, 11)}`;

console.log(`Connecting to MQTT broker: ${options.brokerUrl} (Client ID: ${clientId})...`);

const client = mqtt.connect(options.brokerUrl, {
  clientId,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 15000,
});

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker successfully!');
  client.subscribe(options.topic, { qos: 0 }, (err) => {
    if (err) {
      console.error('❌ MQTT Subscription Error:', err.message);
      process.exit(1);
    }
    console.log(`📡 Subscribed to topic: ${options.topic}`);
    console.log('Listening for live LoRaWAN uplinks...\n');
  });
});

client.on('message', async (topic, messageBuffer) => {
  try {
    const rawString = messageBuffer.toString();
    const decoded = decodeLoRaMessage(rawString, topic);

    if (options.filterDevaddr && decoded.deviceId !== options.filterDevaddr) {
      return; // Skip non-matching devaddr
    }

    // Deduplication check: devaddr + fcnt or devaddr + timestamp
    const dedupeKey = `${decoded.deviceId}_${decoded.signal.fcnt || decoded.timestampMs}`;
    const now = Date.now();
    if (recentPacketSignatures.has(dedupeKey)) {
      const prevTime = recentPacketSignatures.get(dedupeKey);
      if (now - prevTime < 60000) {
        if (options.verbose) console.log(`[DEDUPE] Ignored duplicate packet: ${dedupeKey}`);
        return;
      }
    }
    recentPacketSignatures.set(dedupeKey, now);

    // Clean old deduplication entries
    if (recentPacketSignatures.size > 1000) {
      for (const [k, t] of recentPacketSignatures.entries()) {
        if (now - t > 120000) recentPacketSignatures.delete(k);
      }
    }

    processedCount++;

    console.log(`------------------------------------------------------------`);
    console.log(`[#${processedCount}] Uplink Received | DevAddr: ${decoded.deviceId} | Station: ${decoded.stationName}`);
    console.log(`     • Metric:    ${decoded.primaryMetric.value}${decoded.primaryMetric.unit} (${decoded.primaryMetric.type}, ${decoded.primaryMetric.quality})`);
    console.log(`     • Battery:   ${decoded.metrics.batteryPct ?? 'N/A'}% (${decoded.metrics.batteryMv ?? 'N/A'} mV)`);
    console.log(`     • Signal:    RSSI ${decoded.signal.rssi ?? 'N/A'} dBm | SNR ${decoded.signal.lsnr ?? 'N/A'} dB | Freq ${decoded.signal.freq ?? 'N/A'} MHz`);
    console.log(`     • Timestamp: ${decoded.timestampISO}`);
    console.log(`     • Schema:    ${decoded.schemaType} | Raw Hex: ${decoded.rawHex || '(none)'}`);

    if (options.verbose) {
      console.log(`     • Custom Attributes:`, decoded.customAttributes);
    }

    if (options.worker) {
      if (options.dryRun) {
        console.log(`[DRY-RUN] Would forward raw uplink payload to Cloudflare Worker (${options.workerUrl})`);
      } else {
        try {
          const wRes = await fetch(options.workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: rawString,
          });
          const wJson = await wRes.json();
          if (wRes.status === 200) {
            console.log(`[WORKER INGEST] ✓ HTTP 200 Ingested via Worker -> Reading: ${wJson.readingId} | Tokens: ${wJson.rateLimit?.tokensRemaining} | Safe Rate: ${wJson.rateLimit?.safeWritesPer10s}/10s`);
          } else if (wRes.status === 429) {
            console.log(`[WORKER INGEST] ⏳ HTTP 429 Throttled by Worker (${wJson.reason}): ${wJson.message} (Retry after ${wJson.retryAfterSeconds}s)`);
          } else {
            console.warn(`[WORKER INGEST] ⚠️ Worker returned HTTP ${wRes.status}:`, wJson);
          }
        } catch (wErr) {
          console.error(`[WORKER INGEST] ❌ Exception forwarding to Worker:`, wErr.message);
        }
      }
    } else {
      // 1. Ensure Sensor Document is Provisioned
      await ensureSensorProvisioned(decoded);

      // 2. Ingest Reading into Subcollection
      await ingestReading(decoded);
    }

    // Check limit
    if (options.limit > 0 && processedCount >= options.limit) {
      console.log(`\n✅ Message limit (${options.limit}) reached. Gracefully closing MQTT connection...`);
      client.end(false, () => {
        console.log('Ingestion session complete.');
        process.exit(0);
      });
    }
  } catch (err) {
    console.error('[PACKET ERROR] Error processing incoming MQTT packet:', err.message);
  }
});

client.on('error', (err) => {
  console.error('❌ MQTT Client Error:', err.message);
});

client.on('reconnect', () => {
  console.log('🔄 Reconnecting to MQTT broker...');
});

client.on('offline', () => {
  console.warn('⚠️ MQTT client went offline.');
});

// Graceful termination handling
process.on('SIGINT', () => {
  console.log('\nStopping MQTT ingestion bridge...');
  client.end(true, () => process.exit(0));
});

process.on('SIGTERM', () => {
  client.end(true, () => process.exit(0));
});
