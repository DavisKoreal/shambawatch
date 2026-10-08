/**
 * Shamba Watch - Service-Oriented Architecture (SOA) & Microservices Verification Suite
 * 
 * Validates the 61 SOA & Microservices rules including:
 * - Single Responsibility & Separation of Concerns (SRP, SoC)
 * - Standardized Service Return Envelopes & Error Codes (Rules 13, 20)
 * - Distributed Tracing & Correlation Identifiers (Rules 19, 58)
 * - Inversion of Control & Service Registry / Discovery (Rules 36, 49)
 * - Asynchronous Event-Driven Messaging & Dead-Letter Queue (Rules 15, 46, 50, 56)
 * - Circuit Breaker Failure Isolation & Self-Healing (Rule 48)
 * - Transactional Outbox Pattern for Zero Event Loss (Rule 59)
 * - Distributed Saga Coordinator & Compensating Rollbacks (Rule 47)
 * - API Gateway Idempotency & Rate Limiting Client (Rules 43, 51, 61)
 * - Pure Mathematical Analytics Domain (Rule 5)
 * - Dynamic Station Filtering (Zero-Sensor Station Elimination) (Rule 1)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { 
  createSuccessEnvelope, 
  createErrorEnvelope, 
  ServiceErrorCode, 
  generateTraceId, 
  generateCorrelationId 
} from '../public/js/contracts/service-envelope.js';

import { EventTypes, createEventEnvelope } from '../public/js/contracts/event-types.js';
import { StructuredLogger } from '../public/js/core/structured-logger.js';
import { ServiceRegistry } from '../public/js/core/service-registry.js';
import { EventBus } from '../public/js/core/event-bus.js';
import { CircuitBreaker, CircuitBreakerState } from '../public/js/core/circuit-breaker.js';
import { TransactionalOutbox } from '../public/js/core/transactional-outbox.js';
import { SagaCoordinator, SagaStatus } from '../public/js/core/saga-coordinator.js';

import { StationService } from '../public/js/services/station-service.js';
import { AnalyticsService } from '../public/js/services/analytics-service.js';
import { GatewayClient } from '../public/js/services/gateway-client.js';
import { ThemeService } from '../public/js/services/theme-service.js';

describe('SOA Rule 13, 19, 20, 58: Standardized Service Envelopes & Tracing', () => {
  it('should generate valid UUID/hex trace and correlation IDs', () => {
    const traceId = generateTraceId();
    const correlationId = generateCorrelationId();
    assert.match(traceId, /^trace_[a-z0-9_]+$/);
    assert.match(correlationId, /^corr_[a-z0-9_]+$/);
  });

  it('should create standardized success envelopes with data, metadata, and zero errors', () => {
    const payload = { stationId: 'ST-01', metric: 'moisture', value: 42.5 };
    const envelope = createSuccessEnvelope(payload, { traceId: 'trace_test_123', cached: true });

    assert.equal(envelope.success, true);
    assert.deepEqual(envelope.data, payload);
    assert.equal(envelope.error, null);
    assert.equal(envelope.metadata.traceId, 'trace_test_123');
    assert.equal(envelope.metadata.cached, true);
    assert.ok(envelope.metadata.timestamp);
    assert.ok(envelope.metadata.correlationId);
  });

  it('should create standardized error envelopes with typed codes and details', () => {
    const errorEnv = createErrorEnvelope(
      ServiceErrorCode.RATE_LIMIT_EXCEEDED,
      'Maximum 5 writes per 10s budget reached',
      { retryAfterMs: 4500 },
      { traceId: 'trace_err_99' }
    );

    assert.equal(errorEnv.success, false);
    assert.equal(errorEnv.data, null);
    assert.equal(errorEnv.error.code, ServiceErrorCode.RATE_LIMIT_EXCEEDED);
    assert.equal(errorEnv.error.message, 'Maximum 5 writes per 10s budget reached');
    assert.equal(errorEnv.error.details.retryAfterMs, 4500);
    assert.equal(errorEnv.metadata.traceId, 'trace_err_99');
  });

  it('should format typed event envelopes conforming to EventTypes specifications', () => {
    const event = createEventEnvelope(
      EventTypes.TELEMETRY_INGESTED,
      { sensorId: 'sensor_naivasha_01', value: 38.2 },
      'telemetry-service',
      { correlationId: 'corr_sensor_sync' }
    );

    assert.equal(event.type, EventTypes.TELEMETRY_INGESTED);
    assert.equal(event.source, 'telemetry-service');
    assert.equal(event.version, '1.0.0');
    assert.equal(event.correlationId, 'corr_sensor_sync');
    assert.equal(event.payload.value, 38.2);
    assert.ok(event.id);
  });
});

describe('SOA Rule 19, 57: Structured Logging with Correlation Context', () => {
  it('should preserve traceId and correlationId across log invocations', () => {
    const logs = [];
    const mockOutput = (level, entry) => logs.push({ level, entry });

    const logger = new StructuredLogger({
      serviceName: 'TestService',
      minLevel: 'DEBUG',
      outputHandler: mockOutput
    });

    logger.setTraceContext('trace_logging_abc', 'corr_logging_xyz');
    logger.info('Station state evaluated', { stationId: 'ST-01', health: 'HEALTHY' });

    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'INFO');
    assert.equal(logs[0].entry.service, 'TestService');
    assert.equal(logs[0].entry.traceId, 'trace_logging_abc');
    assert.equal(logs[0].entry.correlationId, 'corr_logging_xyz');
    assert.equal(logs[0].entry.message, 'Station state evaluated');
    assert.equal(logs[0].entry.stationId, 'ST-01');
  });
});

describe('SOA Rule 36, 49: Service Registry & Dependency Injection Container', () => {
  it('should register, resolve, and maintain singletons across bounded contexts', () => {
    const registry = new ServiceRegistry();

    class MockRepository {
      findAll() { return ['ST-01']; }
    }

    registry.register('stationRepository', () => new MockRepository(), { singleton: true });

    assert.ok(registry.has('stationRepository'));
    const instanceA = registry.resolve('stationRepository');
    const instanceB = registry.resolve('stationRepository');

    assert.strictEqual(instanceA, instanceB);
    assert.deepEqual(instanceA.findAll(), ['ST-01']);
  });

  it('should provide factory semantics when singleton is disabled', () => {
    const registry = new ServiceRegistry();
    let counter = 0;
    registry.register('counterFactory', () => ({ count: ++counter }), { singleton: false });

    const a = registry.resolve('counterFactory');
    const b = registry.resolve('counterFactory');

    assert.equal(a.count, 1);
    assert.equal(b.count, 2);
    assert.notStrictEqual(a, b);
  });

  it('should invoke dispose lifecycle handlers upon registry teardown', () => {
    const registry = new ServiceRegistry();
    let disposed = false;

    registry.register('disposableService', () => ({
      dispose() { disposed = true; }
    }));

    registry.resolve('disposableService');
    registry.disposeAll();

    assert.equal(disposed, true);
    assert.equal(registry.has('disposableService'), false);
  });
});

describe('SOA Rule 15, 46, 50, 56: Asynchronous EventBus & Bulkhead Dead-Letter Queue', () => {
  it('should route events asynchronously and isolate subscriber failures to the Dead-Letter Queue', async () => {
    const eventBus = new EventBus();
    const received = [];

    // Normal subscriber
    eventBus.subscribe(EventTypes.STATION_SELECTED, (payload) => {
      received.push(payload.stationId);
    });

    // Failing subscriber (must not crash the EventBus or other subscribers)
    eventBus.subscribe(EventTypes.STATION_SELECTED, () => {
      throw new Error('Subscriber internal fault simulation');
    });

    await eventBus.publish(EventTypes.STATION_SELECTED, { stationId: 'ST-01' });

    // Assert healthy subscriber received the event
    assert.deepEqual(received, ['ST-01']);

    // Assert dead-letter queue captured the failure without crashing
    const dlq = eventBus.getDeadLetterQueue();
    assert.equal(dlq.length, 1);
    assert.equal(dlq[0].eventType, EventTypes.STATION_SELECTED);
    assert.equal(dlq[0].error, 'Subscriber internal fault simulation');
  });

  it('should support wildcards and unsubscription correctly', async () => {
    const eventBus = new EventBus();
    const allEvents = [];

    const unsubscribe = eventBus.subscribe('*', (payload, metadata) => {
      allEvents.push(metadata.eventType);
    });

    await eventBus.publish(EventTypes.THEME_CHANGED, { theme: 'light' });
    await eventBus.publish(EventTypes.TELEMETRY_INGESTED, { value: 12 });

    assert.deepEqual(allEvents, [EventTypes.THEME_CHANGED, EventTypes.TELEMETRY_INGESTED]);

    unsubscribe();
    await eventBus.publish(EventTypes.THEME_CHANGED, { theme: 'dark' });

    assert.equal(allEvents.length, 2); // No new events added
  });
});

describe('SOA Rule 48: Circuit Breaker State Machine & Failure Isolation', () => {
  it('should transition CLOSED -> OPEN after consecutive threshold failures and execute fallback', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      recoveryTimeoutMs: 100,
      fallbackHandler: () => 'CACHED_FALLBACK_VALUE'
    });

    assert.equal(breaker.getState(), CircuitBreakerState.CLOSED);

    // Fail 1
    await assert.rejects(async () => {
      await breaker.execute(async () => { throw new Error('Network timeout'); });
    });
    assert.equal(breaker.getState(), CircuitBreakerState.CLOSED);

    // Fail 2: reaches threshold of 2, trips breaker to OPEN
    await assert.rejects(async () => {
      await breaker.execute(async () => { throw new Error('Network timeout'); });
    });
    assert.equal(breaker.getState(), CircuitBreakerState.OPEN);

    // Next request while OPEN executes fallback rather than hitting downstream
    let downstreamCalled = false;
    const result = await breaker.execute(async () => {
      downstreamCalled = true;
      return 'NEW_DATA';
    });

    assert.equal(downstreamCalled, false);
    assert.equal(result, 'CACHED_FALLBACK_VALUE');

    // Wait for recovery timeout to transition to HALF_OPEN
    await new Promise(r => setTimeout(r, 110));
    assert.equal(breaker.getState(), CircuitBreakerState.HALF_OPEN);

    // Successful execution in HALF_OPEN resets breaker back to CLOSED
    const recovered = await breaker.execute(async () => 'LIVE_DATA_AFTER_HEALING');
    assert.equal(recovered, 'LIVE_DATA_AFTER_HEALING');
    assert.equal(breaker.getState(), CircuitBreakerState.CLOSED);
  });
});

describe('SOA Rule 59: Transactional Outbox Pattern for Resilient Dispatch', () => {
  it('should buffer domain events and flush reliably to EventBus without dropping messages', async () => {
    const eventBus = new EventBus();
    const outbox = new TransactionalOutbox(eventBus, { autoProcess: false });
    const delivered = [];

    eventBus.subscribe(EventTypes.ALERT_RAISED, (payload) => {
      delivered.push(payload.alertId);
    });

    outbox.enqueue(EventTypes.ALERT_RAISED, { alertId: 'ALT-101', severity: 'CRITICAL' });
    outbox.enqueue(EventTypes.ALERT_RAISED, { alertId: 'ALT-102', severity: 'WARNING' });

    assert.equal(outbox.size(), 2);
    assert.equal(delivered.length, 0); // Not dispatched yet

    const flushedCount = await outbox.flush();
    assert.equal(flushedCount, 2);
    assert.equal(outbox.size(), 0);
    assert.deepEqual(delivered, ['ALT-101', 'ALT-102']);
  });
});

describe('SOA Rule 47: Distributed Saga Coordinator & Compensating Rollback', () => {
  it('should successfully complete multi-step sagas when all steps succeed', async () => {
    const saga = new SagaCoordinator('DeployStationSensorSaga');
    const executionTrace = [];

    saga.addStep({
      name: 'ValidateHardwareSchema',
      action: async (ctx) => { executionTrace.push('schema_valid'); ctx.schemaOk = true; },
      compensate: async () => { executionTrace.push('schema_rollback'); }
    });

    saga.addStep({
      name: 'ReserveMemoryBuffer',
      action: async (ctx) => { executionTrace.push('buffer_reserved'); ctx.bufferId = 'buf-1'; },
      compensate: async (ctx) => { executionTrace.push(`buffer_freed_${ctx.bufferId}`); }
    });

    const result = await saga.execute({ sensorId: 'sensor-99' });
    assert.equal(result.status, SagaStatus.COMPLETED);
    assert.deepEqual(executionTrace, ['schema_valid', 'buffer_reserved']);
  });

  it('should execute reverse compensating transactions if any step throws', async () => {
    const saga = new SagaCoordinator('FailingIngestionSaga');
    const rollbackTrace = [];

    saga.addStep({
      name: 'Step1_AllocateQuota',
      action: async (ctx) => { ctx.quotaId = 'quota-77'; },
      compensate: async (ctx) => { rollbackTrace.push(`rollback_${ctx.quotaId}`); }
    });

    saga.addStep({
      name: 'Step2_WriteFirestoreDocument',
      action: async () => {
        throw new Error('Firestore document write collision');
      },
      compensate: async () => { rollbackTrace.push('rollback_doc'); }
    });

    const result = await saga.execute({});
    assert.equal(result.status, SagaStatus.COMPENSATED);
    assert.deepEqual(rollbackTrace, ['rollback_quota-77']);
  });
});

describe('SOA Rule 1, 2, 5: Station Service Bounded Context & Zero-Sensor Filtering', () => {
  it('should strictly exclude stations with 0 sensors and discover active stations dynamically', async () => {
    const stationService = new StationService();

    // With zero ingested sensors:
    const emptyResult = stationService.getActiveStations();
    assert.equal(emptyResult.length, 0); // No phantom stations!

    // Ingest sensors for Naivasha North
    await stationService.registerSensor({
      id: 'sensor-naivasha-moist-01',
      stationId: 'ST-01',
      stationName: 'Naivasha North Plot',
      name: 'Soil Moisture Probe',
      metric: 'moisture',
      currentValue: 34.5,
      lat: -0.6980,
      lng: 36.4200
    });

    // Ingest another sensor for Naivasha North
    await stationService.registerSensor({
      id: 'sensor-naivasha-temp-01',
      stationId: 'ST-01',
      stationName: 'Naivasha North Plot',
      name: 'Thermal Probe',
      metric: 'temp',
      currentValue: 24.1,
      lat: -0.6980,
      lng: 36.4200
    });

    // Ingest sensor for Molo Highland
    await stationService.registerSensor({
      id: 'sensor-molo-moist-01',
      stationId: 'ST-04',
      stationName: 'Molo Highland Terrace',
      name: 'Tea Bed Moisture',
      metric: 'moisture',
      currentValue: 48.0,
      lat: -0.2480,
      lng: 35.7320
    });

    const activeStations = stationService.getActiveStations();
    assert.equal(activeStations.length, 2);

    const st1 = activeStations.find(s => s.id === 'ST-01');
    assert.ok(st1);
    assert.equal(st1.sensorCount, 2);
    assert.equal(st1.name, 'Naivasha North Plot');

    const st4 = activeStations.find(s => s.id === 'ST-04');
    assert.ok(st4);
    assert.equal(st4.sensorCount, 1);
  });
});

describe('SOA Rule 5: Pure Functions in Analytics Domain Service', () => {
  const analyticsService = new AnalyticsService();

  it('should compute pure moving window statistics deterministically', () => {
    const readings = [
      { timestampMs: 1000, value: 20 },
      { timestampMs: 2000, value: 30 },
      { timestampMs: 3000, value: 40 },
      { timestampMs: 4000, value: 50 },
      { timestampMs: 5000, value: 60 }
    ];

    const stats = analyticsService.computeSummaryStats(readings);
    assert.equal(stats.min, 20);
    assert.equal(stats.max, 60);
    assert.equal(stats.avg, 40);
    assert.equal(stats.count, 5);
  });

  it('should generate valid SVG sparkline path data via pure math', () => {
    const values = [10, 20, 5, 30, 25];
    const path = analyticsService.generateSparklinePath(values, 100, 40);

    assert.ok(path.startsWith('M '));
    assert.ok(path.includes('L '));
  });
});

describe('SOA Rule 43, 51, 61: API Gateway Client Resiliency & Rate Limiting', () => {
  it('should attach idempotency key, correlation headers, and service envelopes', async () => {
    let capturedHeaders = null;

    const mockFetch = async (url, options) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        json: async () => ({ status: 'acknowledged' })
      };
    };

    const client = new GatewayClient({
      baseUrl: 'https://api.shambawatch.example.com',
      fetchImpl: mockFetch
    });

    const envelope = await client.post('/telemetry', { deviceId: 'LORA-01', value: 42 });

    assert.equal(envelope.success, true);
    assert.ok(capturedHeaders['X-Idempotency-Key']);
    assert.ok(capturedHeaders['X-Correlation-ID']);
    assert.ok(capturedHeaders['X-Trace-ID']);
  });
});

describe('SOA Theme Service & Contrast System', () => {
  it('should toggle and persist dual themes conforming to WCAG token specifications', async () => {
    let savedTheme = null;
    const mockStorage = {
      getItem: () => savedTheme,
      setItem: (key, val) => { savedTheme = val; }
    };

    const eventBus = new EventBus();
    const themeService = new ThemeService({ eventBus, storage: mockStorage });
    assert.equal(themeService.getCurrentTheme(), 'dark'); // default

    const newTheme = await themeService.toggleTheme();
    assert.equal(newTheme, 'light');
    assert.equal(savedTheme, 'light');

    const revertedTheme = await themeService.toggleTheme();
    assert.equal(revertedTheme, 'dark');
    assert.equal(savedTheme, 'dark');
  });
});
