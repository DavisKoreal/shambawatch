#!/usr/bin/env node
/**
 * @fileoverview Physical Hardware Sensor Ingestion Gateway Script for Shamba Watch.
 * 
 * Simulates edge field gateways (e.g. ESP32 / Pycom / SIM7600 4G LTE-M) deployed across
 * agricultural basins reading Modbus RS-485 NPK probes, ultrasonic water level sensors,
 * and radiometric thermal IR sensors.
 * 
 * Demonstrates:
 * 1. Hardware Packet Ingestion & Modbus Hex Frame Decoding.
 * 2. Mapping to Canonical Sensor Schema (Hypotheses 1-50, SWE Principles 1-41).
 * 3. Immutable Timeseries Ingestion into Google Cloud Firestore Subcollections.
 * 
 * Usage:
 *   node scripts/ingest_telemetry.js --station ST-01 --dry-run
 *   node scripts/ingest_telemetry.js --station ST-01 --loop --interval 3
 *   node scripts/ingest_telemetry.js --emulator --host localhost:8080
 */

import { APP_CONFIG, Logger } from '../public/js/config/app-config.js';
import { SensorReading } from '../public/js/domain/sensor-reading.js';
import { MetricDefinition } from '../public/js/domain/metric-definition.js';

// ============================================================================
// CLI ARGUMENT PARSER (No external dependencies)
// ============================================================================
const args = process.argv.slice(2);
const options = {
  station: 'ST-01',
  loop: false,
  intervalSeconds: 4,
  dryRun: false,
  projectId: process.env.FIREBASE_PROJECT_ID || 'shambawatch',
  emulator: false,
  emulatorHost: 'localhost:8080',
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--station' && args[i + 1]) options.station = args[++i].toUpperCase();
  else if (arg === '--loop') options.loop = true;
  else if (arg === '--interval' && args[i + 1]) options.intervalSeconds = Math.max(1, Number(args[++i]));
  else if (arg === '--dry-run') options.dryRun = true;
  else if (arg === '--project' && args[i + 1]) options.projectId = args[++i];
  else if (arg === '--emulator') options.emulator = true;
  else if (arg === '--host' && args[i + 1]) {
    options.emulator = true;
    options.emulatorHost = args[++i];
  }
}

// ============================================================================
// MODBUS RS-485 PACKET DECODER (Hardware Layer)
// Simulates RS-485 Modbus RTU response frame from 7-in-1 Soil Probe (Nerokas / JXCT)
// Frame: [Address: 1B][Function: 1B][ByteCount: 1B][Moisture: 2B][Temp: 2B][EC: 2B][pH: 2B][N: 2B][P: 2B][K: 2B][CRC: 2B]
// ============================================================================
function generateModbusSoilProbeFrame() {
  const moistureRaw = Math.floor(rand(250, 750)); // 25.0% - 75.0%
  const tempRaw = Math.floor(rand(180, 280));     // 18.0°C - 28.0°C
  const nRaw = Math.floor(rand(20, 80));          // mg/kg
  const pRaw = Math.floor(rand(15, 60));          // mg/kg
  const kRaw = Math.floor(rand(30, 90));          // mg/kg

  return {
    probeId: 'HW-PROBE-01',
    timestampMs: Date.now(),
    channels: {
      moisture: Number((moistureRaw / 10).toFixed(1)),
      temperature: Number((tempRaw / 10).toFixed(1)),
      nitrogen: nRaw,
      phosphorus: pRaw,
      potassium: kRaw,
    },
    rawHex: `01030E${toHex16(moistureRaw)}${toHex16(tempRaw)}01F402BC${toHex16(nRaw)}${toHex16(pRaw)}${toHex16(kRaw)}A1B2`
  };
}

function generateUltrasonicWaterFrame() {
  const levelPct = Number(rand(15, 95).toFixed(1));
  return {
    sensorId: 'HW-LEVEL-01',
    timestampMs: Date.now(),
    levelPct,
    rawDistanceMm: Math.floor((100 - levelPct) * 20),
  };
}

function generateClimateFrame() {
  return {
    sensorId: 'HW-CLIMATE-01',
    timestampMs: Date.now(),
    humidity: Number(rand(35, 85).toFixed(1)),
    temp: Number(rand(16, 32).toFixed(1)),
  };
}

function toHex16(value) {
  return Math.max(0, Math.min(65535, value)).toString(16).padStart(4, '0').toUpperCase();
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

// ============================================================================
// FIRESTORE REST INGESTION CLIENT
// Uses standard fetch() to post directly to Firestore REST API (Works on Node 18+)
// ============================================================================
class FirestoreRestClient {
  constructor(projectId, useEmulator = false, emulatorHost = 'localhost:8080') {
    this.projectId = projectId;
    this.baseUrl = useEmulator
      ? `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`
      : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  }

  /**
   * Appends an immutable reading document to the readings subcollection.
   */
  async appendReading(stationId, sensorId, reading) {
    const url = `${this.baseUrl}/${APP_CONFIG.FIRESTORE_PATHS.STATIONS_COLLECTION}/${stationId}/${APP_CONFIG.FIRESTORE_PATHS.SENSORS_SUBCOLLECTION}/${sensorId}/${APP_CONFIG.FIRESTORE_PATHS.READINGS_SUBCOLLECTION}?documentId=${reading.id}`;

    const firestoreDoc = {
      fields: {
        id: { stringValue: reading.id },
        sensorId: { stringValue: reading.sensorId },
        timestampMs: { integerValue: String(reading.timestampMs) },
        timestampISO: { stringValue: reading.timestampISO },
        value: { doubleValue: Number(reading.value) },
        quality: { stringValue: reading.quality },
        delta: { doubleValue: Number(reading.delta) },
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(firestoreDoc),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firestore REST API returned ${response.status}: ${errText}`);
    }

    return await response.json();
  }

  /**
   * Updates parent sensor current state with patch mask.
   */
  async updateCurrentState(stationId, sensorId, reading) {
    const url = `${this.baseUrl}/${APP_CONFIG.FIRESTORE_PATHS.STATIONS_COLLECTION}/${stationId}/${APP_CONFIG.FIRESTORE_PATHS.SENSORS_SUBCOLLECTION}/${sensorId}?updateMask.fieldPaths=currentState.latestValue&updateMask.fieldPaths=currentState.lastSampledMs&updateMask.fieldPaths=currentState.delta`;

    const patchDoc = {
      fields: {
        currentState: {
          mapValue: {
            fields: {
              latestValue: { doubleValue: Number(reading.value) },
              lastSampledMs: { integerValue: String(reading.timestampMs) },
              delta: { doubleValue: Number(reading.delta) },
            }
          }
        }
      }
    };

    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchDoc),
    });

    if (!response.ok) {
      // It is normal to fail if parent document isn't seeded yet
      return null;
    }

    return await response.json();
  }
}

// ============================================================================
// MAIN INGESTION DISPATCHER
// ============================================================================
async function runIngestionCycle(stationId, client, dryRun) {
  const timestampMs = Date.now();
  const soilFrame = generateModbusSoilProbeFrame();
  const waterFrame = generateUltrasonicWaterFrame();
  const climateFrame = generateClimateFrame();

  console.log(`\n------------------------------------------------------------`);
  console.log(`[INGEST] Station: ${stationId} | Timestamp: ${new Date(timestampMs).toISOString()}`);
  console.log(`[MODBUS] Raw RS-485 Hex: ${soilFrame.rawHex}`);
  console.log(`[DECODE] Decoded Soil: Moisture=${soilFrame.channels.moisture}% | N=${soilFrame.channels.nitrogen} | P=${soilFrame.channels.phosphorus} | K=${soilFrame.channels.potassium}`);
  console.log(`[DECODE] Ultrasonic Water Level: ${waterFrame.levelPct}% (distance: ${waterFrame.rawDistanceMm}mm)`);
  console.log(`[DECODE] Climate Canopy: Temp=${climateFrame.temp}°C | Humidity=${climateFrame.humidity}%`);

  // Map to Canonical Sensor Channels
  const readings = [
    new SensorReading({
      sensorId: `urn:shamba:station:${stationId.toLowerCase()}:sensor:moisture`,
      value: soilFrame.channels.moisture,
      timestampMs,
      quality: 'GOOD',
      delta: 0.2,
    }),
    new SensorReading({
      sensorId: `urn:shamba:station:${stationId.toLowerCase()}:sensor:water`,
      value: waterFrame.levelPct,
      timestampMs,
      quality: 'GOOD',
      delta: -0.1,
    }),
    new SensorReading({
      sensorId: `urn:shamba:station:${stationId.toLowerCase()}:sensor:nitrogen`,
      value: soilFrame.channels.nitrogen,
      timestampMs,
      quality: 'GOOD',
      delta: 0.0,
    }),
    new SensorReading({
      sensorId: `urn:shamba:station:${stationId.toLowerCase()}:sensor:phosphorus`,
      value: soilFrame.channels.phosphorus,
      timestampMs,
      quality: 'GOOD',
      delta: 0.0,
    }),
    new SensorReading({
      sensorId: `urn:shamba:station:${stationId.toLowerCase()}:sensor:potassium`,
      value: soilFrame.channels.potassium,
      timestampMs,
      quality: 'GOOD',
      delta: 0.0,
    }),
    new SensorReading({
      sensorId: `urn:shamba:station:${stationId.toLowerCase()}:sensor:humidity`,
      value: climateFrame.humidity,
      timestampMs,
      quality: 'GOOD',
      delta: -0.4,
    }),
    new SensorReading({
      sensorId: `urn:shamba:station:${stationId.toLowerCase()}:sensor:temp`,
      value: climateFrame.temp,
      timestampMs,
      quality: 'GOOD',
      delta: 0.3,
    }),
  ];

  for (const reading of readings) {
    const sensorChannel = reading.sensorId.split(':').pop();
    if (dryRun) {
      console.log(`  [DRY-RUN] Would append to /stations/${stationId}/sensors/${reading.sensorId}/readings/${reading.id}: val=${reading.value}`);
    } else {
      try {
        await client.appendReading(stationId, reading.sensorId, reading);
        await client.updateCurrentState(stationId, reading.sensorId, reading);
        console.log(`  ✓ Ingested channel '${sensorChannel}': ${reading.value} (id: ${reading.id})`);
      } catch (err) {
        console.warn(`  ! Firestore push note on '${sensorChannel}': ${err.message}`);
      }
    }
  }
}

async function main() {
  console.log(`============================================================`);
  console.log(` Shamba Watch — Physical Sensor Field Ingestion Gateway`);
  console.log(` Station: ${options.station} | Mode: ${options.dryRun ? 'DRY-RUN' : (options.emulator ? 'EMULATOR' : 'FIRESTORE')}`);
  console.log(` Target Project: ${options.projectId}`);
  console.log(`============================================================`);

  const client = new FirestoreRestClient(options.projectId, options.emulator, options.emulatorHost);

  // Single shot or Loop
  await runIngestionCycle(options.station, client, options.dryRun);

  if (options.loop) {
    console.log(`\nEntering continuous field telemetry loop (Interval: ${options.intervalSeconds}s). Press Ctrl+C to stop.`);
    setInterval(async () => {
      await runIngestionCycle(options.station, client, options.dryRun);
    }, options.intervalSeconds * 1000);
  } else {
    console.log(`\nSingle ingestion cycle complete.`);
  }
}

main().catch((err) => {
  console.error('[FATAL] Ingestion gateway failed:', err);
  process.exit(1);
});
