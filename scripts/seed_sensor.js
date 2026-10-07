#!/usr/bin/env node
/**
 * @fileoverview Seeds a verified test sensor document and time series data into Firestore collection /sensors.
 * Specifically provisions a sensor labeled as "test sensor" with full metadata, altitude, location,
 * and historical readings.
 * 
 * User Requirement:
 * "We need to seed the sensors document in firestore with data from one sensor and this sesnor should
 * have a label of test sensor. Test sesnors are sensors connected to just test the system"
 * 
 * Usage:
 *   node scripts/seed_sensor.js
 *   node scripts/seed_sensor.js --emulator
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { APP_CONFIG } from '../public/js/config/app-config.js';
import { FIREBASE_CONFIG } from '../public/js/config/firebase-config.js';

console.log('\n============================================================');
console.log('  SHAMBA WATCH — SENSOR SEEDING & PROVISIONING UTILITY');
console.log('============================================================\n');

const isEmulator = process.argv.includes('--emulator');
const projectId = process.env.FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId || 'shambawatch';

const baseUrl = isEmulator
  ? `http://localhost:8080/v1/projects/${projectId}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

/**
 * Resolves or refreshes Google OAuth2 access token from Firebase CLI configstore.
 */
async function resolveAuthToken() {
  if (isEmulator) return null;

  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    console.warn('⚠️ Warning: firebase-tools.json not found. Proceeding without auth header.');
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const tokens = config.tokens;
    if (!tokens || !tokens.access_token) return null;

    // Refresh if within 2 minutes of expiry
    if ((!tokens.access_token || !tokens.expires_at || Date.now() > (tokens.expires_at - 120000)) && tokens.refresh_token) {
      console.log('[AUTH] Refreshing Firebase OAuth access token...');
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
        console.log('[AUTH] Token refreshed successfully.');
      }
    }

    return tokens.access_token;
  } catch (err) {
    console.warn('⚠️ Could not resolve token from firebase-tools.json:', err.message);
    return null;
  }
}

const authToken = await resolveAuthToken();
const headers = { 'Content-Type': 'application/json' };
if (authToken) {
  headers['Authorization'] = `Bearer ${authToken}`;
}

const sensorId = 'test_sensor_01';
const sensorDocUrl = `${baseUrl}/${APP_CONFIG.FIRESTORE_PATHS.SENSORS_COLLECTION}/${sensorId}`;

const nowMs = Date.now();

// 1. Root Sensor Document Payload
const sensorPayload = {
  fields: {
    id: { stringValue: sensorId },
    stationId: { stringValue: 'ST-TEST-01' },
    metadata: {
      mapValue: {
        fields: {
          name: { stringValue: 'System Diagnostic Test Sensor' },
          description: { stringValue: 'Test sensor connected to just test the system' },
          sensorType: { stringValue: 'test sensor' },
          crop: { stringValue: 'Test Bench Calibration' },
          stationId: { stringValue: 'ST-TEST-01' },
          stationName: { stringValue: 'Central System Test Bench' },
          altitudeMeters: { integerValue: '1890' },
          minDepthCm: { integerValue: '0' },
          maxDepthCm: { integerValue: '15' },
          location: {
            mapValue: {
              fields: {
                stationId: { stringValue: 'ST-TEST-01' },
                stationName: { stringValue: 'Central System Test Bench' },
                lat: { doubleValue: -0.2833 },
                lng: { doubleValue: 36.0667 },
                altitudeMeters: { integerValue: '1890' },
                depthCm: { integerValue: '15' }
              }
            }
          },
          hardware: {
            mapValue: {
              fields: {
                manufacturer: { stringValue: 'Shamba Diagnostics Lab' },
                model: { stringValue: 'Modbus RTU Test Rig v1' },
                serialNumber: { stringValue: 'SN-TEST-BENCH-001' },
                hardwareId: { stringValue: 'HW-TEST-PROBE-01' }
              }
            }
          },
          customAttributes: {
            mapValue: {
              fields: {
                label: { stringValue: 'test sensor' },
                category: { stringValue: 'test sensor' },
                purpose: { stringValue: 'Test sensors are sensors connected to just test the system' },
                status: { stringValue: 'active_testing' }
              }
            }
          }
        }
      }
    },
    metricDefinition: {
      mapValue: {
        fields: {
          metricType: { stringValue: 'moisture' },
          unitSymbol: { stringValue: '%' },
          minValid: { integerValue: '0' },
          maxValid: { integerValue: '100' },
          precision: { integerValue: '1' }
        }
      }
    },
    thresholds: {
      mapValue: {
        fields: {
          criticalLow: { integerValue: '20' },
          warningLow: { integerValue: '35' },
          warningHigh: { integerValue: '80' },
          criticalHigh: { integerValue: '95' },
          hysteresis: { integerValue: '2' }
        }
      }
    },
    currentState: {
      mapValue: {
        fields: {
          latestValue: { doubleValue: 46.2 },
          lastSampledMs: { integerValue: String(nowMs) },
          status: { stringValue: 'nominal' },
          quality: { stringValue: 'GOOD' },
          delta: { doubleValue: 0.2 },
          batteryPct: { integerValue: '100' }
        }
      }
    }
  }
};

console.log(`[SEED] Writing Test Sensor Document: /sensors/${sensorId}...`);
try {
  const res = await fetch(sensorDocUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(sensorPayload)
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('❌ Failed to seed sensor document (HTTP ' + res.status + '):', data.error?.message || data);
    process.exit(1);
  }
  console.log(`✅ Sensor Document Provisioned: ${sensorId}`);
  console.log(`   • Label:         "test sensor"`);
  console.log(`   • Purpose:       "Test sensors are sensors connected to just test the system"`);
  console.log(`   • Station:       Central System Test Bench (ST-TEST-01)`);
  console.log(`   • Elevation:     1,890m ASL`);
  console.log(`   • Coordinates:   -0.2833, 36.0667`);
  console.log(`   • Current Value: 46.2%`);
} catch (err) {
  console.error('❌ Request exception:', err.message);
  process.exit(1);
}

// 2. Append Historical Time Series Readings
console.log(`\n[SEED] Appending Time Series Readings to /sensors/${sensorId}/readings...`);

const historicalPoints = [
  { deltaMs: 600000, value: 45.0, delta: 0.0 }, // 10m ago
  { deltaMs: 450000, value: 45.4, delta: 0.4 }, // 7.5m ago
  { deltaMs: 300000, value: 45.8, delta: 0.4 }, // 5m ago
  { deltaMs: 150000, value: 46.0, delta: 0.2 }, // 2.5m ago
  { deltaMs: 0,      value: 46.2, delta: 0.2 }, // now
];

let seededReadings = 0;
for (let i = 0; i < historicalPoints.length; i++) {
  const pt = historicalPoints[i];
  const readingMs = nowMs - pt.deltaMs;
  const readingId = `reading_${readingMs}`;
  const readingUrl = `${sensorDocUrl}/readings/${readingId}`;

  const readingPayload = {
    fields: {
      id: { stringValue: readingId },
      sensorId: { stringValue: sensorId },
      timestampMs: { integerValue: String(readingMs) },
      timestampISO: { stringValue: new Date(readingMs).toISOString() },
      value: { doubleValue: pt.value },
      quality: { stringValue: 'GOOD' },
      delta: { doubleValue: pt.delta },
      batteryPct: { integerValue: '100' }
    }
  };

  try {
    const rRes = await fetch(readingUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(readingPayload)
    });

    if (rRes.ok) {
      seededReadings++;
      console.log(`   ✓ Reading #${i + 1} [${readingId}]: ${pt.value}% at ${new Date(readingMs).toLocaleTimeString()}`);
    } else {
      const err = await rRes.json();
      console.warn(`   ⚠️ Reading #${i + 1} write notice (HTTP ${rRes.status}):`, err.error?.message || err);
    }
  } catch (e) {
    console.warn(`   ⚠️ Reading #${i + 1} write exception:`, e.message);
  }
}

console.log(`\n============================================================`);
console.log(`✅ TEST SENSOR PROVISIONING COMPLETE!`);
console.log(`   • Target Project:    ${projectId}`);
console.log(`   • Sensor Document:   /sensors/${sensorId}`);
console.log(`   • Labeled:           "test sensor"`);
console.log(`   • Description:       "Test sensors are sensors connected to just test the system"`);
console.log(`   • Seeded Readings:   ${seededReadings} data points in time series`);
console.log(`============================================================\n`);
