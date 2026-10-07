/**
 * @fileoverview Unit Test Suite for Polymorphic LoRaWAN Decoder.
 * Verifies resilient decoding across standard LoRaWAN envelopes, custom WiFi envelopes,
 * 5FEE hex payloads, pre-decoded JSON, and unexpected/evolving IoT schemas.
 * 
 * Run with: node tests/lorawan-decoder.test.js
 */

import assert from 'node:assert/strict';
import { decodeLoRaMessage } from '../public/js/domain/lorawan-decoder.js';

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\n--- Running Polymorphic LoRaWAN Decoder Unit Tests ---\n');

// 1. Standard LoRaWAN Gateway Uplink (Teleops 5FEE hex)
test('should decode standard LoRaWAN gateway packet with 5FEE hex payload', () => {
  const payload = {
    all_gw: [
      {
        desc: "ESP Gateway",
        gpsalt: 1,
        gpspos: { lat: 52, lon: 5 },
        lsnr: 4,
        mac: "BCFF4DFFFF17A953",
        rssi: -76
      }
    ],
    app: "Teleopshandlers",
    best_gw: {
      desc: "ESP Gateway",
      gpsalt: 1890,
      gpspos: { lat: -0.2833, lon: 36.0667 },
      lsnr: 4,
      mac: "BCFF4DFFFF17A953",
      rssi: -76
    },
    codr: "4/5",
    data: "5FEE044903B122B10BE1",
    datetime: "2026-10-05T06:26:03Z",
    datr: "SF12BW125",
    desc: "Tivoili, Kisumu",
    devaddr: "02010518",
    fcnt: 3357,
    freq: 868.099975,
    lsnr: 4,
    mac: "BCFF4DFFFF17A953",
    netid: "0123AB",
    port: 1,
    rssi: -76
  };

  const decoded = decodeLoRaMessage(payload);

  assert.equal(decoded.deviceId, '02010518');
  assert.equal(decoded.sensorId, 'lora_02010518');
  assert.equal(decoded.stationId, 'ST-KISUMU-01');
  assert.equal(decoded.stationName, 'Tivoili Station, Kisumu');
  assert.equal(decoded.schemaType, 'teleops_5fee');

  // Word 2: 0x03B1 = 945 -> 94.5%
  assert.equal(decoded.metrics.moisture, 94.5);
  assert.equal(decoded.primaryMetric.value, 94.5);
  assert.equal(decoded.primaryMetric.unit, '%');
  assert.equal(decoded.primaryMetric.quality, 'GOOD');

  // Word 4: 0x0BE1 = 3041 mV battery
  assert.equal(decoded.metrics.batteryMv, 3041);
  assert.ok(decoded.metrics.batteryPct > 90);

  // RF signal
  assert.equal(decoded.signal.rssi, -76);
  assert.equal(decoded.signal.lsnr, 4);
  assert.equal(decoded.signal.fcnt, 3357);

  // Time
  assert.equal(decoded.timestampISO, '2026-10-05T06:26:03.000Z');
  assert.equal(decoded.timestampMs, Date.parse('2026-10-05T06:26:03Z'));
});

// 2. Custom Direct WiFi Gateway Payload
test('should decode custom WiFi gateway envelope with unix ms timestamp and wifi_rssi', () => {
  const customPayload = {
    devaddr: "02010530",
    data: "5fee0497023300000b95",
    custom: "true",
    datetime: 1791181691683,
    timestamp: 1791181691683,
    mac: "A1B2C3D4E5F6",
    wifi_rssi: "-20",
    connection: "active_ap"
  };

  const decoded = decodeLoRaMessage(JSON.stringify(customPayload));

  assert.equal(decoded.deviceId, '02010530');
  assert.equal(decoded.sensorId, 'lora_02010530');
  assert.equal(decoded.timestampMs, 1791181691683);
  assert.equal(decoded.signal.wifiRssi, -20);
  assert.equal(decoded.schemaType, 'teleops_5fee');

  // Word 2: 0x0233 = 563 -> 56.3%
  assert.equal(decoded.metrics.moisture, 56.3);

  // Word 4: 0x0B95 = 2965 mV
  assert.equal(decoded.metrics.batteryMv, 2965);
  assert.ok(decoded.metrics.batteryPct > 80);

  // Custom attributes preserved without error
  assert.equal(decoded.customAttributes.custom, 'true');
  assert.equal(decoded.customAttributes.connection, 'active_ap');
});

// 3. Pre-decoded JSON Payload
test('should decode pre-decoded JSON payload without hex decoding needed', () => {
  const jsonPayload = {
    deviceId: "ST-WEATHER-09",
    timestamp: "2026-10-05T07:15:00Z",
    desc: "Naivasha North Greenhouse",
    decoded_payload: {
      temperature: 24.6,
      humidity: 58.2,
      soil_moisture: 42.1,
      battery: 95
    }
  };

  const decoded = decodeLoRaMessage(jsonPayload);

  assert.equal(decoded.deviceId, 'ST-WEATHER-09');
  assert.equal(decoded.stationId, 'ST-01');
  assert.equal(decoded.schemaType, 'json_decoded');
  assert.equal(decoded.metrics.temperature, 24.6);
  assert.equal(decoded.metrics.humidity, 58.2);
  assert.equal(decoded.metrics.moisture, 42.1);
  assert.equal(decoded.metrics.batteryPct, 95);
  assert.equal(decoded.primaryMetric.type, 'moisture');
  assert.equal(decoded.primaryMetric.value, 42.1);
});

// 4. Generic Hex Fallback with Battery Heuristic
test('should decode arbitrary generic hex string with word channels and battery heuristic', () => {
  // 6 bytes: 0x01E0 (480 -> 48.0%), 0x002A (42), 0x0B54 (2900 mV battery)
  const genericHexPacket = {
    devaddr: "AA001122",
    data: "01E0002A0B54",
    desc: "Pharmaceutical",
  };

  const decoded = decodeLoRaMessage(genericHexPacket);

  assert.equal(decoded.deviceId, 'AA001122');
  assert.equal(decoded.stationId, 'ST-PHARMA-01');
  assert.equal(decoded.schemaType, 'generic_hex');
  assert.equal(decoded.metrics.batteryMv, 2900);
  assert.ok(decoded.metrics.batteryPct > 70);
  assert.equal(decoded.metrics.moisture, 48.0);
  assert.equal(decoded.metrics.channel_2, 42);
});

// 5. Schema Agility: Unknown & Evolving Envelope Keys
test('should absorb arbitrary unknown and evolving schema keys into customAttributes', () => {
  const evolvingSchema = {
    nodeId: "EDGE-SENSOR-99",
    soilMoisture: 38.5,
    firmware_version: "v4.2.1-beta",
    lora_region: "EU868",
    mesh_hop_count: 3,
    unexpected_nested_object: { signal_lock: true, snr_history: [4, 5, 6] }
  };

  const decoded = decodeLoRaMessage(evolvingSchema);

  assert.equal(decoded.deviceId, 'EDGE-SENSOR-99');
  assert.equal(decoded.metrics.moisture, 38.5);
  assert.equal(decoded.customAttributes.firmware_version, 'v4.2.1-beta');
  assert.equal(decoded.customAttributes.lora_region, 'EU868');
  assert.equal(decoded.customAttributes.mesh_hop_count, '3');
  assert.ok(decoded.customAttributes.unexpected_nested_object.includes('signal_lock'));
});

// 6. Resilience on Corrupted Strings
test('should never throw when encountering malformed string inputs', () => {
  const corrupted = "NOT_A_VALID_JSON_OR_HEX!@#$%%";
  const decoded = decodeLoRaMessage(corrupted, 'lorawan-server-uplink/02010999');

  assert.equal(decoded.deviceId, '02010999');
  assert.ok(decoded.timestampMs > 0);
  assert.ok(decoded.primaryMetric.value !== undefined);
});

console.log(`\n✅ All ${passed} Polymorphic LoRaWAN Decoder Tests Passed!\n`);
