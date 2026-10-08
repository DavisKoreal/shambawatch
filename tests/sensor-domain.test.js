/**
 * @fileoverview Standalone Unit Test Suite for Shamba Watch Sensor Domain Model.
 * Verifies core SWE Principles: SRP, Pure Functions, Immutability, Appendability,
 * Configurable Windowing, Hysteresis, and Test Fixture Isolation (Principles 21, 22, 23, 40).
 * Run with: node tests/sensor-domain.test.js
 */

import assert from 'node:assert/strict';
import { SensorMetadata } from '../public/js/domain/sensor-metadata.js';
import { MetricDefinition } from '../public/js/domain/metric-definition.js';
import { ThresholdRule } from '../public/js/domain/threshold-rule.js';
import { SensorReading } from '../public/js/domain/sensor-reading.js';
import { Sensor } from '../public/js/domain/sensor.js';
import { InMemorySensorRepository } from '../public/js/infrastructure/in-memory-sensor-repository.js';
import { FirestoreSensorRepository } from '../public/js/infrastructure/firestore-sensor-repository.js';
import { SensorRegistry } from '../public/js/services/sensor-registry.js';
import { ShambaAgent } from '../public/js/services/shamba-agent.js';
import { decodeLoRaMessage } from '../public/js/domain/lorawan-decoder.js';
import { APP_CONFIG } from '../public/js/config/app-config.js';

let passedTests = 0;

function test(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

console.log('\n--- Running Shamba Watch Sensor Domain Unit Tests ---\n');

// ============================================================================
// 1. SENSOR METADATA TESTS
// ============================================================================
console.log('1. SensorMetadata Tests:');

test('should create valid metadata and reject empty name', () => {
  const meta = new SensorMetadata({
    name: 'Topsoil Moisture Probe',
    description: '0-25cm depth',
    manufacturer: 'Nerokas',
    model: '7-in-1',
    minDepthCm: 0,
    maxDepthCm: 25,
  });

  assert.equal(meta.name, 'Topsoil Moisture Probe');
  assert.equal(meta.minDepthCm, 0);
  assert.equal(meta.maxDepthCm, 25);
  assert.throws(() => new SensorMetadata({ name: '' }), TypeError);
});

test('should dynamically append and retrieve custom attributes (Hypothesis 9)', () => {
  const meta = new SensorMetadata({ name: 'Test Sensor' });

  // Append extra field (User Requirement)
  meta.appendAttribute('cropType', 'Maize');
  meta.appendAttribute('calibrationDate', '2026-09-29');

  assert.equal(meta.getAttribute('cropType'), 'Maize');
  assert.equal(meta.getAttribute('calibrationDate'), '2026-09-29');
  assert.equal(meta.getAttribute('nonExistent', 'defaultVal'), 'defaultVal');
  assert.equal(meta.hasAttribute('cropType'), true);

  // Serialization check
  const json = meta.toJSON();
  assert.equal(json.customAttributes.cropType, 'Maize');

  // Deserialization check
  const restored = SensorMetadata.fromJSON(json);
  assert.equal(restored.getAttribute('cropType'), 'Maize');
});

// ============================================================================
// 2. METRIC DEFINITION TESTS
// ============================================================================
console.log('\n2. MetricDefinition Tests:');

test('should validate physical boundaries and format values', () => {
  const metric = new MetricDefinition({
    metricType: 'moisture',
    unitSymbol: '%',
    minValid: 0,
    maxValid: 100,
    precision: 1,
  });

  assert.equal(metric.isValid(50), true);
  assert.equal(metric.isValid(0), true);
  assert.equal(metric.isValid(100), true);
  assert.equal(metric.isValid(-5), false);
  assert.equal(metric.isValid(105), false);
  assert.equal(metric.isValid(NaN), false);

  assert.equal(metric.format(42.567), '42.6 %');
  assert.equal(metric.clamp(120), 100);
  assert.equal(metric.clamp(-10), 0);
});

// ============================================================================
// 3. THRESHOLD RULE & HYSTERESIS TESTS
// ============================================================================
console.log('\n3. ThresholdRule & Hysteresis Tests:');

test('should correctly classify values and apply deadband hysteresis', () => {
  const rule = new ThresholdRule({
    criticalLow: 20,
    warningLow: 35,
    warningHigh: 85,
    criticalHigh: 95,
    hysteresis: 2.0,
  });

  // Nominal value
  assert.equal(rule.evaluate(50, 'nominal'), 'nominal');

  // Below warning threshold
  assert.equal(rule.evaluate(30, 'nominal'), 'watch');

  // Below critical threshold
  assert.equal(rule.evaluate(15, 'watch'), 'alert');

  // Hysteresis test: Value rises to 21 (above 20, but below 20 + 2 = 22) -> remains in alert!
  assert.equal(rule.evaluate(21, 'alert'), 'alert');

  // Value rises to 22.5 (above deadband) -> clears alert to watch
  assert.equal(rule.evaluate(22.5, 'alert'), 'watch');

  // Value rises to 37 (above warningLow + hysteresis = 37) -> clears to nominal
  assert.equal(rule.evaluate(37.1, 'watch'), 'nominal');
});

// ============================================================================
// 4. SENSOR READING IMMUTABILITY TESTS
// ============================================================================
console.log('\n4. SensorReading Tests:');

test('should create immutable time series reading with delta calculation', () => {
  const reading = new SensorReading({
    sensorId: 'sensor-01',
    value: 41.2,
    timestampMs: 1727611200000,
    quality: 'GOOD',
    delta: 1.5,
  });

  assert.equal(reading.value, 41.2);
  assert.equal(reading.delta, 1.5);
  assert.equal(reading.timestampISO, new Date(1727611200000).toISOString());

  // Strict immutability check
  assert.equal(Object.isFrozen(reading), true);
  assert.throws(() => {
    // @ts-ignore
    reading.value = 50;
  });
});

// ============================================================================
// 5. SENSOR AGGREGATE ROOT & CONFIGURABLE WINDOWING TESTS
// ============================================================================
console.log('\n5. Sensor Aggregate Root & Windowing Tests:');

test('should append readings, calculate deltas, and evaluate current state', () => {
  const sensor = new Sensor({
    id: 'urn:shamba:station:st-01:sensor:moisture',
    stationId: 'ST-01',
    metadata: new SensorMetadata({ name: 'Naivasha Moisture' }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE),
    thresholds: new ThresholdRule({ criticalLow: 20, warningLow: 35 }),
  });

  const now = Date.now();
  // Append first reading
  sensor.addReading(45.0, now - 3000);
  assert.equal(sensor.currentState.latestValue, 45.0);
  assert.equal(sensor.currentState.delta, 0);
  assert.equal(sensor.currentState.status, 'nominal');

  // Append second reading (delta calculation)
  sensor.addReading(48.5, now - 2000);
  assert.equal(sensor.currentState.latestValue, 48.5);
  assert.equal(sensor.currentState.delta, 3.5);

  // Append third reading below threshold
  sensor.addReading(18.0, now - 1000);
  assert.equal(sensor.currentState.status, 'alert');
  assert.equal(sensor.isAlerting(), true);
});

test('should prune points according to configurable window duration (User Approved Decision)', () => {
  const sensor = new Sensor({
    id: 'test-sensor-window',
    stationId: 'ST-01',
    metadata: new SensorMetadata({ name: 'Window Test' }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE),
    windowDurationMs: 60 * 1000, // 1 minute window
  });

  const now = Date.now();
  // Old reading (2 minutes ago)
  sensor.addReading(30, now - 120000);
  // Recent reading (30 seconds ago)
  sensor.addReading(40, now - 30000);
  // Current reading
  sensor.addReading(50, now);

  // The 2-minute-old reading should have been pruned out of the 1-minute window
  const timeseries = sensor.getTimeseries();
  assert.equal(timeseries.length, 2);
  assert.equal(timeseries[0].value, 40);
  assert.equal(timeseries[1].value, 50);

  // Change window duration to 5 minutes
  sensor.setWindow(5 * 60 * 1000);
  assert.equal(sensor.windowDurationMs, 300000);
});

test('should compute correct statistics over time window', () => {
  const sensor = new Sensor({
    id: 'test-sensor-stats',
    stationId: 'ST-01',
    metadata: new SensorMetadata({ name: 'Stats Test' }),
    metricDefinition: new MetricDefinition({ metricType: 'moisture', precision: 1 }),
  });

  const now = Date.now();
  sensor.addReading(10, now - 3000);
  sensor.addReading(20, now - 2000);
  sensor.addReading(30, now - 1000);

  const stats = sensor.getStatistics();
  assert.equal(stats.min, 10);
  assert.equal(stats.max, 30);
  assert.equal(stats.avg, 20.0);
  assert.equal(stats.count, 3);
});

test('should correctly serialize and deserialize a complete Sensor entity', () => {
  const original = new Sensor({
    id: 'urn:shamba:test:moisture',
    stationId: 'ST-01',
    metadata: new SensorMetadata({
      name: 'Serialization Test',
      customAttributes: { batchId: 'B-102', zone: 'North' },
    }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE),
    thresholds: new ThresholdRule({ criticalLow: 20 }),
  });

  const now = Date.now();
  original.addReading(44.2, now - 1000);

  const json = original.toJSON();
  assert.equal(json.id, 'urn:shamba:test:moisture');
  assert.equal(json.metadata.customAttributes.batchId, 'B-102');

  const restored = Sensor.fromJSON(json, [original.getLatestReading().toJSON()]);
  assert.equal(restored.id, original.id);
  assert.equal(restored.metadata.name, original.metadata.name);
  assert.equal(restored.getMetadataAttribute('batchId'), 'B-102');
  assert.equal(restored.currentState.latestValue, 44.2);
});

// ============================================================================
// 6. REPOSITORY & REGISTRY INTEGRATION TESTS
// ============================================================================
console.log('\n6. SensorRegistry & InMemoryRepository Integration Tests:');

await testAsync('should register sensors, dispatch readings, and notify observers', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  const sensor = new Sensor({
    id: 'urn:shamba:st-01:sensor:moisture',
    stationId: 'ST-01',
    metadata: new SensorMetadata({ name: 'Registry Test Moisture' }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE),
  });

  const eventsReceived = [];
  registry.onChange((event, updatedSensor) => {
    eventsReceived.push({ event, id: updatedSensor.id });
  });

  await registry.registerSensor(sensor);
  assert.ok(eventsReceived.some(e => e.event === 'REGISTER'));
  assert.equal(eventsReceived[0].id, sensor.id);

  // Append reading via registry
  await registry.recordReading(sensor.id, 55.4);
  assert.equal(eventsReceived[eventsReceived.length - 1].event, 'READING');
  assert.equal(sensor.currentState.latestValue, 55.4);

  // Query registry by station and metric
  const stationSensors = registry.getSensorsByStation('ST-01');
  assert.equal(stationSensors.length, 1);

  const moistureSensors = registry.getSensorsByMetric('moisture');
  assert.equal(moistureSensors.length, 1);
});

await testAsync('should initialize canonical 6 stations with discrete logical sensors', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  const STATIONS_SPEC = [
    { id: 'ST-01', name: 'Naivasha North Plot', crop: 'Flower greenhouse', water: 62, moisture: 41, nutrient: { n: 58, p: 44, k: 71 }, humidity: 55, temp: 26.4 },
    { id: 'ST-02', name: 'Ol Kalou Maize Block', crop: 'Maize', water: 18, moisture: 22, nutrient: { n: 31, p: 29, k: 40 }, humidity: 38, temp: 29.1 },
  ];

  await registry.initializeDefaultStations(STATIONS_SPEC);

  // Each station should have 7 discrete logical sensors (Moisture, Water, N, P, K, Humidity, Temp)
  const st1Sensors = registry.getSensorsByStation('ST-01');
  assert.equal(st1Sensors.length, 7);

  // Verify multi-parameter channels share the same physical probe hardwareId
  const nSensor = st1Sensors.find(s => s.metricDefinition.metricType === 'nitrogen');
  const pSensor = st1Sensors.find(s => s.metricDefinition.metricType === 'phosphorus');
  assert.equal(nSensor.metadata.hardwareId, 'HW-PROBE-ST-01-01');
  assert.equal(pSensor.metadata.hardwareId, 'HW-PROBE-ST-01-01');
  assert.equal(nSensor.metadata.minDepthCm, 25);
  assert.equal(nSensor.metadata.maxDepthCm, 40);

  // Verify readings were pre-populated
  assert.equal(nSensor.getTimeseries().length, 24);
});

// ============================================================================
// 7. FIRESTORE REPOSITORY & REPOSITORY SWITCHING TESTS
// ============================================================================
console.log('\n7. FirestoreSensorRepository & Repository Switching Tests:');

class MockDocRef {
  constructor(data = {}) {
    this._data = { ...data };
    this._collections = new Map();
  }
  async get() {
    return {
      exists: Object.keys(this._data).length > 0,
      data: () => ({ ...this._data }),
    };
  }
  async set(data, options = {}) {
    if (options.merge) {
      this._data = { ...this._data, ...data };
    } else {
      this._data = { ...data };
    }
  }
  collection(name) {
    if (!this._collections.has(name)) {
      this._collections.set(name, new MockCollectionRef());
    }
    return this._collections.get(name);
  }
}

class MockCollectionRef {
  constructor() {
    this._docs = new Map();
    this._listeners = new Set();
  }
  doc(id) {
    if (!this._docs.has(id)) {
      this._docs.set(id, new MockDocRef());
    }
    return this._docs.get(id);
  }
  async get() {
    const docs = Array.from(this._docs.entries()).map(([id, docRef]) => ({
      id,
      data: () => ({ ...docRef._data }),
    }));
    return { docs };
  }
  where(field, op, val) {
    const filtered = new MockCollectionRef();
    for (const [id, docRef] of this._docs.entries()) {
      if (docRef._data && docRef._data[field] === val) {
        filtered._docs.set(id, docRef);
      }
    }
    return filtered;
  }
  orderBy() {
    return this;
  }
  limit() {
    return this;
  }
  onSnapshot(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }
}

class MockFirestore {
  constructor() {
    this._collections = new Map();
  }
  collection(name) {
    if (!this._collections.has(name)) {
      this._collections.set(name, new MockCollectionRef());
    }
    return this._collections.get(name);
  }
}

await testAsync('should save, retrieve, and append readings via FirestoreSensorRepository', async () => {
  const mockDb = new MockFirestore();
  const firestoreRepo = new FirestoreSensorRepository(mockDb);

  const sensor = new Sensor({
    id: 'urn:shamba:station:st-01:sensor:moisture',
    stationId: 'ST-01',
    metadata: new SensorMetadata({
      name: 'Naivasha Soil Moisture Probe',
      manufacturer: 'Nerokas',
      model: '7-in-1',
      minDepthCm: 10,
      maxDepthCm: 25,
      customAttributes: { crop: 'Roses' }
    }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE),
    thresholds: new ThresholdRule(APP_CONFIG.METRIC_TYPES.MOISTURE.defaultThresholds),
  });

  // Save to Firestore
  await firestoreRepo.saveSensor(sensor);

  // Append Reading to subcollection
  const reading = new SensorReading({
    sensorId: sensor.id,
    timestampMs: Date.now(),
    value: 48.5,
    quality: 'GOOD',
    delta: 1.2
  });
  await firestoreRepo.appendReading('ST-01', sensor.id, reading);

  // Retrieve sensor
  const fetched = await firestoreRepo.getSensor('ST-01', sensor.id);
  assert.ok(fetched);
  assert.equal(fetched.id, sensor.id);
  assert.equal(fetched.metadata.name, 'Naivasha Soil Moisture Probe');
  assert.equal(fetched.metadata.getAttribute('crop'), 'Roses');

  // Verify getSensorsByStation
  const stationSensors = await firestoreRepo.getSensorsByStation('ST-01');
  assert.equal(stationSensors.length, 1);
  assert.equal(stationSensors[0].id, sensor.id);
});

await testAsync('should switch repositories and synchronize state in SensorRegistry', async () => {
  const inMemoryRepo = new InMemorySensorRepository();
  const registry = new SensorRegistry(inMemoryRepo);

  const sensor = new Sensor({
    id: 'urn:shamba:station:st-03:sensor:water',
    stationId: 'ST-03',
    metadata: new SensorMetadata({ name: 'Nakuru Basin Water Level' }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.WATER_LEVEL),
    thresholds: new ThresholdRule(APP_CONFIG.METRIC_TYPES.WATER_LEVEL.defaultThresholds),
  });
  sensor.addReading(76.2);

  await registry.registerSensor(sensor);
  assert.equal(registry.getRepository(), inMemoryRepo);

  // Switch to Firestore Repository
  const mockDb = new MockFirestore();
  const firestoreRepo = new FirestoreSensorRepository(mockDb);
  registry.setRepository(firestoreRepo);
  assert.equal(registry.getRepository(), firestoreRepo);

  // Synchronize state to new repository
  await registry.syncToRepository();

  // Verify sensor was saved to mock Firestore
  const savedSensor = await firestoreRepo.getSensor('ST-03', sensor.id);
  assert.ok(savedSensor);
  assert.equal(savedSensor.metadata.name, 'Nakuru Basin Water Level');
});

// ============================================================================
// 8. SENSOR AUTO-DISCOVERY & SHAMBA-AGENT INTELLIGENCE TESTS
// ============================================================================
console.log('\n8. Sensor Auto-Discovery & ShambaAgent Tests:');

await testAsync('should emit SENSOR_DISCOVERED event only for newly detected field sensors after boot', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  const discoveredEvents = [];
  registry.onChange((event, sensor) => {
    if (event === 'SENSOR_DISCOVERED') {
      discoveredEvents.push(sensor);
    }
  });

  // Seed default stations (boot phase)
  await registry.initializeDefaultStations([
    { id: 'ST-01', name: 'Naivasha North Plot', crop: 'Flower greenhouse', water: 62, moisture: 41, nutrient: { n: 58, p: 44, k: 71 }, humidity: 55, temp: 26.4 }
  ]);

  // Assert NO discovery events were emitted during initial boot seeding
  assert.equal(discoveredEvents.length, 0);

  // Simulate a physical field sensor newly reporting from the field
  const newFieldSensor = new Sensor({
    id: 'urn:shamba:station:st-01:sensor:ec',
    stationId: 'ST-01',
    metadata: new SensorMetadata({
      name: 'Naivasha Soil EC Probe',
      manufacturer: 'Nerokas',
      model: '7-in-1 Modbus',
      customAttributes: { hardwareId: 'HW-PROBE-01' }
    }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE),
    thresholds: new ThresholdRule(),
  });

  await registry.registerSensor(newFieldSensor);

  // Assert SENSOR_DISCOVERED was triggered
  assert.equal(discoveredEvents.length, 1);
  assert.equal(discoveredEvents[0].id, 'urn:shamba:station:st-01:sensor:ec');
  assert.equal(discoveredEvents[0].metadata.name, 'Naivasha Soil EC Probe');
});

await testAsync('should answer platform telemetry, alert, and agronomic queries via ShambaAgent', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  const stations = [
    { id: 'ST-01', name: 'Naivasha North Plot', crop: 'Flower greenhouse', water: 62, moisture: 41, nutrient: { n: 58, p: 44, k: 71 }, humidity: 55, temp: 26.4 },
    { id: 'ST-02', name: 'Ol Kalou Maize Block', crop: 'Maize', water: 18, moisture: 22, nutrient: { n: 31, p: 29, k: 40 }, humidity: 38, temp: 29.1 },
  ];
  await registry.initializeDefaultStations(stations);

  const agent = new ShambaAgent({ registry, stations });

  // 1. Alerts query
  const alertResponse = await agent.query('What are the active alerts?');
  assert.ok(alertResponse.text.length > 10);
  assert.ok(Array.isArray(alertResponse.suggestions));

  // 2. Station-specific inquiry
  const naivashaResponse = await agent.query('What is the status of Naivasha?');
  assert.ok(naivashaResponse.text.includes('Naivasha North Plot'));
  assert.equal(naivashaResponse.action.type, 'SELECT_STATION');
  assert.equal(naivashaResponse.action.stationId, 'ST-01');

  // 3. Nutrients inquiry
  const nutrientsResponse = await agent.query('Show nutrients in Ol Kalou');
  assert.ok(nutrientsResponse.text.includes('Nitrogen (N)'));
  assert.ok(nutrientsResponse.text.includes('Phosphorus (P)'));

  // 4. Irrigation advice
  const irrigationResponse = await agent.query('Recommend irrigation schedule');
  assert.ok(irrigationResponse.text.includes('Irrigation'));
});

await testAsync('should dispatch to remote intelligence gateway and extract actions and suggestions', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);
  const stations = [
    { id: 'ST-01', name: 'Naivasha North Plot', crop: 'Flower greenhouse', water: 62, moisture: 41, nutrient: { n: 58, p: 44, k: 71 }, humidity: 55, temp: 26.4 },
  ];
  await registry.initializeDefaultStations(stations);

  const agent = new ShambaAgent({ registry, stations, enableRemoteGateway: true });

  const originalFetch = globalThis.fetch;
  let interceptedUrl = null;
  let interceptedBody = null;

  globalThis.fetch = async (url, options) => {
    interceptedUrl = url;
    interceptedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-test-001',
        choices: [{
          message: {
            role: 'assistant',
            content: 'Telemetry analysis complete for Naivasha North Plot: soil moisture is steady at 41%.'
          }
        }]
      })
    };
  };

  try {
    const res = await agent.query('Analyze Naivasha soil conditions');
    assert.equal(interceptedUrl, APP_CONFIG.AI_GATEWAY.WORKER_ENDPOINT);
    assert.ok(interceptedBody.messages.length === 2);
    assert.equal(interceptedBody.messages[0].role, 'system');
    assert.ok(interceptedBody.messages[0].content.includes('Shamba Watch Field AI Agent'));
    assert.ok(interceptedBody.messages[0].content.includes('Naivasha North Plot'));
    assert.equal(interceptedBody.messages[1].content, 'Analyze Naivasha soil conditions');
    assert.ok(res.text.includes('Naivasha North Plot'));
    assert.equal(res.action.type, 'SELECT_STATION');
    assert.equal(res.action.stationId, 'ST-01');
    assert.ok(Array.isArray(res.suggestions));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('should gracefully fall back to local agronomy engine if remote gateway throws', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);
  const stations = [
    { id: 'ST-01', name: 'Naivasha North Plot', crop: 'Flower greenhouse', water: 62, moisture: 41, nutrient: { n: 58, p: 44, k: 71 }, humidity: 55, temp: 26.4 },
  ];
  await registry.initializeDefaultStations(stations);

  const agent = new ShambaAgent({ registry, stations, enableRemoteGateway: true });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Connection refused: Gateway unreachable');
  };

  try {
    const fallbackRes = await agent.query('What is the status of Naivasha?');
    // Verifies fallback executed seamlessly without bubbling network exception
    assert.ok(fallbackRes.text.includes('Naivasha North Plot'));
    assert.equal(fallbackRes.action.type, 'SELECT_STATION');
    assert.equal(fallbackRes.action.stationId, 'ST-01');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ============================================================================
// 9. SYSTEM STATE PROOF & GROUNDING TESTS
// ============================================================================
console.log('\n9. System State Proof & Zero-Sensor Grounding Tests:');

await testAsync('should compute valid SystemStateProof for empty and populated states', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  // 1. Empty state proof
  const emptyProof = registry.getSystemStateProof();
  assert.equal(emptyProof.totalSensors, 0);
  assert.equal(emptyProof.isEmpty, true);
  assert.equal(emptyProof.stateHash, '00000000-EMPTY');
  assert.equal(emptyProof.stations.length, 0);

  // 2. Register a physical sensor with location and altitude
  const sensor = new Sensor({
    id: 'sensor_naivasha_01',
    stationId: 'ST-01',
    metadata: new SensorMetadata({
      name: 'Naivasha Soil Moisture',
      altitudeMeters: 1890,
      location: {
        stationId: 'ST-01',
        stationName: 'Naivasha North Plot',
        lat: -0.698,
        lng: 36.42,
        altitudeMeters: 1890,
        depthCm: 15
      }
    }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE)
  });
  await registry.registerSensor(sensor);

  // 3. Populated state proof
  const populatedProof = registry.getSystemStateProof();
  assert.equal(populatedProof.totalSensors, 1);
  assert.equal(populatedProof.isEmpty, false);
  assert.ok(populatedProof.stateHash.startsWith('PROVED-'));
  assert.equal(populatedProof.sensors[0].altitudeMeters, 1890);
  assert.equal(populatedProof.stations.length, 1);
  assert.equal(populatedProof.stations[0].altitudeMeters, 1890);
});

await testAsync('should explicitly declare 0 sensors when registry has zero sensors', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  // Strictly empty registry (0 sensors)
  const agent = new ShambaAgent({ registry, stations: [], enableRemoteGateway: false });

  const response = await agent.query('Hello, what is the status of our stations?');
  assert.ok(response.text.includes('0 sensors'));
  assert.ok(response.text.includes('Firestore database'));
});

await testAsync('should dynamically discover stations from sensor metadata', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  const sensor = new Sensor({
    id: 'sensor_molo_tea_01',
    stationId: 'ST-04',
    metadata: new SensorMetadata({
      name: 'Molo Highland Moisture',
      altitudeMeters: 2450,
      location: {
        stationId: 'ST-04',
        stationName: 'Molo Highland Terrace',
        lat: -0.247,
        lng: 35.733,
        altitudeMeters: 2450,
      },
      customAttributes: { crop: 'Tea' }
    }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE)
  });
  await registry.registerSensor(sensor);

  const stations = registry.getStations();
  assert.equal(stations.length, 1);
  assert.equal(stations[0].id, 'ST-04');
  assert.equal(stations[0].name, 'Molo Highland Terrace');
  assert.equal(stations[0].altitudeMeters, 2450);
  assert.equal(stations[0].crop, 'Tea');
  assert.equal(stations[0].sensorCount, 1);
});

console.log('\n10. Conversational Dialog & Multi-Turn Intelligence Tests:');

await testAsync('should forward multi-turn conversation history in ShambaAgent query', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);
  const agent = new ShambaAgent({ registry, stations: [], enableRemoteGateway: true });

  const capturedPayloads = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    capturedPayloads.push(JSON.parse(opts.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: "Shamba Watch monitors precision agriculture metrics including root-zone soil moisture and NPK nutrients."
          }
        }]
      })
    };
  };

  try {
    const history = [
      { role: 'user', content: 'Habari!' },
      { role: 'assistant', content: 'Habari! I am the Shamba Watch Field AI Agent.' }
    ];

    const response = await agent.query('How does this platform work?', history);
    assert.ok(response.text.includes('Shamba Watch monitors'));
    assert.equal(capturedPayloads.length, 1);

    const payload = capturedPayloads[0];
    assert.equal(payload.messages.length, 4); // [system, user turn 1, assistant turn 1, current user turn]
    assert.equal(payload.messages[0].role, 'system');
    assert.ok(payload.messages[0].content.includes('PLATFORM ARCHITECTURE & OVERVIEW'));
    assert.ok(payload.messages[0].content.includes('Total Verified Sensors: 0 (EMPTY)'));
    assert.equal(payload.messages[1].role, 'user');
    assert.equal(payload.messages[1].content, 'Habari!');
    assert.equal(payload.messages[2].role, 'assistant');
    assert.equal(payload.messages[3].role, 'user');
    assert.equal(payload.messages[3].content, 'How does this platform work?');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testAsync('should provide friendly offline reminder when network is off in local fallback', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);
  const agent = new ShambaAgent({ registry, stations: [], enableRemoteGateway: false });

  const response = await agent.query('What is the status of Naivasha?');
  assert.ok(response.text.includes('Offline Mode'));
  assert.ok(response.text.includes('remote intelligence network is currently offline'));
  assert.ok(response.text.includes('0 sensors'));
});

await testAsync('should recognize test sensor and explain that test sensors are connected to just test the system', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);
  const testSensor = new Sensor({
    id: 'test_sensor_01',
    stationId: 'ST-TEST-01',
    metadata: new SensorMetadata({
      name: 'System Diagnostic Test Sensor',
      description: 'Test sensor connected to just test the system',
      altitudeMeters: 1890,
      location: {
        stationId: 'ST-TEST-01',
        stationName: 'Central System Test Bench',
        lat: -0.2833,
        lng: 36.0667,
        altitudeMeters: 1890,
        depthCm: 15
      },
      customAttributes: {
        label: 'test sensor',
        purpose: 'Test sensors are sensors connected to just test the system'
      }
    }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE)
  });
  testSensor.currentState = {
    latestValue: 46.2,
    lastSampledMs: Date.now(),
    status: APP_CONFIG.HEALTH_STATUS.NOMINAL,
    quality: 'GOOD',
    delta: 0.0
  };
  await registry.registerSensor(testSensor);

  const agent = new ShambaAgent({ registry, stations: [], enableRemoteGateway: false });
  const response = await agent.query('What is the test sensor?');
  assert.ok(response.text.includes('test sensor'));
  assert.ok(response.text.includes('Test sensors are sensors connected to just test the system'));
  assert.ok(response.text.includes('46.2%'));
});

// ============================================================================
// 11. POLYMORPHIC LORAWAN DECODER & DOMAIN INTEGRATION TESTS
// ============================================================================
console.log('\n11. Polymorphic LoRaWAN Decoder & Domain Integration Tests:');

await testAsync('should decode live LoRaWAN 5FEE telemetry frame and register Sensor aggregate root', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  const rawSample = {
    all_gw: [{ desc: "ESP Gateway", gpsalt: 1890, gpspos: { lat: -0.0917, lon: 34.7680 }, lsnr: 10, mac: "308398FFFFA21DC0", rssi: -87 }],
    best_gw: { desc: "ESP Gateway", gpsalt: 1890, gpspos: { lat: -0.0917, lon: 34.7680 }, lsnr: 10, mac: "308398FFFFA21DC0", rssi: -87 },
    codr: "4/5",
    data: "5FEE040203A300000B10",
    datetime: new Date().toISOString(),
    datr: "SF12BW125",
    desc: "Tivoili, Kisumu",
    devaddr: "02010570",
    fcnt: 14795,
    freq: 868.099975,
    lsnr: 10,
    mac: "308398FFFFA21DC0",
    netid: "0123AB",
    port: 1,
    rssi: -87
  };

  const decoded = decodeLoRaMessage(rawSample);
  assert.equal(decoded.deviceId, '02010570');
  assert.equal(decoded.stationId, 'ST-KISUMU-01');
  assert.equal(decoded.stationName, 'Tivoili Station, Kisumu');
  // 0x03A3 = 931 -> 93.1% moisture
  assert.equal(decoded.metrics.moisture, 93.1);
  // 0x0B10 = 2832 mV battery
  assert.equal(decoded.metrics.batteryMv, 2832);

  // Instantiate Sensor domain aggregate from decoded packet
  const loraSensor = new Sensor({
    id: decoded.sensorId,
    stationId: decoded.stationId,
    metadata: new SensorMetadata({
      name: `${decoded.stationName} LoRa Moisture Probe`,
      description: `LoRaWAN field telemetry node (DevAddr: ${decoded.deviceId})`,
      sensorType: 'lorawan field sensor',
      crop: decoded.crop,
      stationId: decoded.stationId,
      stationName: decoded.stationName,
      altitudeMeters: decoded.location.altitudeMeters,
      location: decoded.location,
      customAttributes: decoded.customAttributes,
    }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE),
    thresholds: new ThresholdRule(APP_CONFIG.METRIC_TYPES.MOISTURE.defaultThresholds),
  });

  loraSensor.addReading(decoded.primaryMetric.value, decoded.timestampMs);
  loraSensor.currentState.batteryPct = decoded.metrics.batteryPct;

  await registry.registerSensor(loraSensor);

  const registered = registry.getSensor(decoded.sensorId);
  assert.ok(registered);
  assert.equal(registered.id, 'lora_02010570');
  assert.equal(registered.currentState.latestValue, 93.1);
  assert.equal(registered.getMetadataAttribute('fcnt'), '14795');
  assert.equal(registered.getMetadataAttribute('freq'), '868.099975');

  // Verify proof reflects the newly ingested LoRaWAN sensor
  const proof = registry.getSystemStateProof();
  assert.equal(proof.totalSensors, 1);
  assert.equal(proof.sensors[0].stationName, 'Tivoili Station, Kisumu');
});

await testAsync('should resiliently handle unknown future schema without losing custom properties', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  const unknownPayload = {
    device_eui: "FUTURE-IOT-NODE-77",
    reading_type: "deep_aquifer",
    water_level: 68.4,
    battery: 92,
    rf_noise_floor_dbm: -108,
    carrier_frequency: "915MHz",
    mesh_route_cost: 4
  };

  const decoded = decodeLoRaMessage(unknownPayload);
  assert.equal(decoded.deviceId, 'FUTURE-IOT-NODE-77');
  assert.equal(decoded.metrics.water, 68.4);
  assert.equal(decoded.metrics.batteryPct, 92);
  assert.equal(decoded.customAttributes.rf_noise_floor_dbm, '-108');
  assert.equal(decoded.customAttributes.carrier_frequency, '915MHz');
  assert.equal(decoded.customAttributes.mesh_route_cost, '4');
});

// ============================================================================
// 12. DYNAMIC STATION DISCOVERY & ZERO-SENSOR PLACEHOLDER ELIMINATION TESTS
// ============================================================================
console.log('\n12. Dynamic Station Discovery & Zero-Sensor Placeholder Elimination Tests:');

await testAsync('should return empty stations when 0 sensors exist in registry (no phantom/placeholder stations)', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  const fallbackCatalog = [
    { id: 'ST-01', name: 'Naivasha North Plot', lat: -0.6980, lng: 36.4200, crop: 'Flower greenhouse' },
    { id: 'ST-02', name: 'Ol Kalou Maize Block', lat: -0.2760, lng: 36.3730, crop: 'Maize' },
    { id: 'ST-03', name: 'Nakuru Basin Wetland', lat: -0.3670, lng: 36.0800, crop: 'Wetland buffer' },
    { id: 'ST-04', name: 'Molo Highland Terrace', lat: -0.2470, lng: 35.7330, crop: 'Tea' },
    { id: 'ST-05', name: 'Elementaita Rangeland', lat: -0.4550, lng: 36.2500, crop: 'Grazing / rangeland' },
    { id: 'ST-06', name: 'Gilgil River Intake', lat: -0.5020, lng: 36.3190, crop: 'Irrigation intake' }
  ];

  // In the UI, getAllStations returns registry.getStations(fallbackCatalog).filter(s => s.sensorCount > 0)
  const discoveredStations = registry.getStations(fallbackCatalog).filter(s => s.sensorCount > 0);
  assert.equal(discoveredStations.length, 0, 'Must have 0 stations when 0 sensors exist in registry');

  // Agent with dynamic stations function
  const agent = new ShambaAgent({
    registry,
    stations: () => discoveredStations,
    enableRemoteGateway: false
  });

  const summary = await agent.query('overview summary of all stations');
  assert.ok(summary.text.includes('0 sensors'));
  assert.ok(!summary.text.includes('None of the 6 stations'));
  assert.ok(!summary.text.includes('Naivasha North Plot'));

  const alerts = await agent.query('any active alerts or warnings?');
  assert.ok(alerts.text.includes('0 sensors'));
  assert.ok(!alerts.text.includes('None of the 6 stations'));
});

await testAsync('should dynamically register stations only as sensors are ingested', async () => {
  const repo = new InMemorySensorRepository();
  const registry = new SensorRegistry(repo);

  const testCatalog = [
    { id: 'ST-01', name: 'Naivasha North Plot', lat: -0.6980, lng: 36.4200, crop: 'Flower greenhouse' }
  ];

  // Ingest a sensor for ST-01
  const s1 = new Sensor({
    id: 'sensor-rf-01',
    stationId: 'ST-01',
    metadata: new SensorMetadata({
      name: 'Naivasha Soil Probe',
      stationId: 'ST-01',
      location: { lat: -0.6980, lng: 36.4200, altitudeMeters: 1890 }
    }),
    metricDefinition: new MetricDefinition(APP_CONFIG.METRIC_TYPES.MOISTURE)
  });
  s1.addReading(42.5, Date.now());
  await registry.registerSensor(s1);

  const activeStations = registry.getStations(testCatalog).filter(s => s.sensorCount > 0);
  assert.equal(activeStations.length, 1);
  assert.equal(activeStations[0].id, 'ST-01');
  assert.equal(activeStations[0].sensorCount, 1);
  assert.equal(activeStations[0].name, 'Naivasha North Plot');

  const agent = new ShambaAgent({
    registry,
    stations: () => activeStations,
    enableRemoteGateway: false
  });

  const moistureRes = await agent.query('what is the moisture level?');
  assert.ok(moistureRes.text.includes('42.5%'));
});

console.log(`\n========================================`);
console.log(`  ALL ${passedTests} UNIT TESTS PASSED SUCCESSFULLY!`);
console.log(`========================================\n`);
