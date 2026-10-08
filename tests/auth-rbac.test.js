/**
 * @fileoverview Unit and Integration Tests for Auth Service, RBAC, Station Assignment, and Sensor Timeseries
 *
 * Validates:
 * - Admin and Farmer Role Separation (RBAC)
 * - Demo account credential dispatching
 * - Station Assignment bounded context
 * - Custom time window queries in Analytics Domain
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../public/js/services/auth-service.js';
import { AnalyticsService } from '../public/js/services/analytics-service.js';
import { TelemetryService } from '../public/js/services/telemetry-service.js';
import { SensorRegistry } from '../public/js/services/sensor-registry.js';
import { InMemorySensorRepository } from '../public/js/infrastructure/in-memory-sensor-repository.js';
import { Sensor } from '../public/js/domain/sensor.js';
import { SensorMetadata } from '../public/js/domain/sensor-metadata.js';
import { MetricDefinition } from '../public/js/domain/metric-definition.js';
import { EventBus } from '../public/js/core/event-bus.js';
import { EventTypes } from '../public/js/contracts/event-types.js';

test('AuthService: Role-Based Access Control (RBAC) & Session Management', async (t) => {
  await t.test('should initialize unauthenticated with null user and null role', () => {
    const eventBus = new EventBus();
    const authService = new AuthService({ eventBus });

    assert.equal(authService.isAuthenticated, false);
    assert.equal(authService.isAdmin(), true); // Default unauthenticated role is admin for dashboard viewing
    assert.equal(authService.isFarmer(), false);
    assert.equal(authService.getCurrentUser(), null);
    assert.equal(authService.getAssignedStationId(), null);
  });

  await t.test('should quick sign in demo admin with full administrative privileges', async () => {
    const eventBus = new EventBus();
    let authEventFired = false;
    eventBus.subscribe(EventTypes.AUTH_STATE_CHANGED, (payload) => {
      authEventFired = true;
      assert.equal(payload.role, 'admin');
    });

    const authService = new AuthService({ eventBus });
    const res = await authService.quickSignInDemo('admin');

    assert.ok(res.data);
    assert.equal(res.data.profile.role, 'admin');
    assert.equal(authService.isAuthenticated, true);
    assert.equal(authService.isAdmin(), true);
    assert.equal(authService.isFarmer(), false);
    assert.equal(authEventFired, true);
  });

  await t.test('should quick sign in demo farmer bound to specific station', async () => {
    const eventBus = new EventBus();
    const authService = new AuthService({ eventBus });
    const res = await authService.quickSignInDemo('farmer');

    assert.ok(res.data);
    assert.equal(res.data.profile.role, 'farmer');
    assert.equal(authService.isAuthenticated, true);
    assert.equal(authService.isAdmin(), false);
    assert.equal(authService.isFarmer(), true);
    assert.equal(authService.getAssignedStationId(), 'station-naivasha-01');
  });

  await t.test('should sign out cleanly and clear session tokens', async () => {
    const eventBus = new EventBus();
    let clearedState = null;
    eventBus.subscribe(EventTypes.AUTH_STATE_CHANGED, (payload) => {
      clearedState = payload.user;
    });

    const authService = new AuthService({ eventBus });
    await authService.quickSignInDemo('admin');
    await authService.signOut();

    assert.equal(authService.isAuthenticated, false);
    assert.equal(authService.getCurrentUser(), null);
    assert.equal(clearedState, null);
  });
});

test('AuthService: Station Assignment Bounded Context', async (t) => {
  await t.test('should assign station to farmer and broadcast FARMER_ASSIGNED domain event', async () => {
    const eventBus = new EventBus();
    let assignmentEvent = null;
    eventBus.subscribe(EventTypes.FARMER_ASSIGNED, (payload) => {
      assignmentEvent = payload;
    });

    const authService = new AuthService({ eventBus });
    const result = await authService.assignStationToFarmer('farmer-demo-01', 'station-molo-01', 'Molo Highland Station');

    assert.ok(result.data);
    assert.equal(result.data.stationId, 'station-molo-01');
    assert.ok(assignmentEvent);
    assert.equal(assignmentEvent.farmerUid, 'farmer-demo-01');
    assert.equal(assignmentEvent.stationId, 'station-molo-01');
  });

  await t.test('should unassign station when stationId is null or empty', async () => {
    const eventBus = new EventBus();
    const authService = new AuthService({ eventBus });
    const result = await authService.assignStationToFarmer('farmer-demo-01', null);

    assert.ok(result.data);
    assert.equal(result.data.stationId, null);
  });
});

test('AnalyticsService & Sensor Domain: Custom Timeseries Windows & Full History', async (t) => {
  await t.test('should support active sensor selection and window configuration', async () => {
    const eventBus = new EventBus();
    const analytics = new AnalyticsService({ eventBus });

    assert.equal(analytics.activeSensorId, null);
    await analytics.setActiveSensorId('sensor-naivasha-moist-01');
    assert.equal(analytics.activeSensorId, 'sensor-naivasha-moist-01');

    await analytics.setWindow(3600000);
    assert.equal(analytics.activeWindowMs, 3600000);
    assert.equal(analytics.getWindowLabel(3600000), 'Last 1 Hour');
  });

  await t.test('Sensor domain should query full history without pruning when window is 0', () => {
    const meta = new SensorMetadata({
      name: 'Root Zone Moisture',
      altitudeMeters: 1890,
      location: { lat: -0.6980, lng: 36.4200, altitudeMeters: 1890, depthCm: -20 },
      hardware: { id: 'SEN-SOIL-01', model: 'S-Soil MT-02', bus: 'RS485-Modbus' }
    });
    const metric = new MetricDefinition({
      type: 'soil_moisture',
      unit: '%',
      minSafe: 20,
      maxSafe: 60
    });
    const sensor = new Sensor({
      id: 'sensor-test-soil-01',
      stationId: 'station-01',
      metadata: meta,
      metricDefinition: metric,
      windowDurationMs: 0
    });

    const now = Date.now();
    // Add 10 readings over 30 days
    for (let i = 0; i < 10; i++) {
      sensor.addReading(
        30 + i,
        now - (10 - i) * 86400000 * 3, // over 30 days
        'GOOD'
      );
    }

    // Set window to 0 (ALL_TIME)
    sensor.setWindow(0);
    const timeseries = sensor.getTimeseries(0);
    assert.equal(timeseries.length, 10);
  });
});

test('TelemetryService: 3-Minute Resilient Firestore Polling & Lifecycle', async (t) => {
  await t.test('should configure 3-minute poll interval and start/stop timer cleanly', () => {
    const eventBus = new EventBus();
    const repo = new InMemorySensorRepository();
    const registry = new SensorRegistry(repo);
    const telemetry = new TelemetryService({ registry, eventBus });

    // Default interval: 3 minutes = 180,000 ms
    assert.equal(telemetry._pollIntervalMs, 180000);
    assert.equal(telemetry._pollIntervalTimer, null);

    // Start polling with custom interval
    telemetry.startPolling(60000);
    assert.equal(telemetry._pollIntervalMs, 60000);
    assert.notEqual(telemetry._pollIntervalTimer, null);

    // Stop polling
    telemetry.stopPolling();
    assert.equal(telemetry._pollIntervalTimer, null);

    // Dispose cleans up all resources
    telemetry.startPolling(180000);
    telemetry.dispose();
    assert.equal(telemetry._pollIntervalTimer, null);
  });

  await t.test('should gracefully handle pollFirestoreReadings when not connected to Firebase', async () => {
    const eventBus = new EventBus();
    const repo = new InMemorySensorRepository();
    const registry = new SensorRegistry(repo);
    const telemetry = new TelemetryService({ registry, eventBus });

    const result = await telemetry.pollFirestoreReadings();
    assert.equal(result.success, false);
    assert.equal(result.reason, 'NOT_CONNECTED');
  });
});

