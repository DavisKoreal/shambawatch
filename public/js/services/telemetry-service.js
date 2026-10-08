/**
 * Shamba Watch 2.0 — Telemetry Service (Telemetry Ingestion Bounded Context)
 * Adheres to Rules 1 (SRP), 15 (Resource Management), 42 (Database Isolation),
 * 46 (Event-Driven), and 54 (Bounded Context).
 */

import { StructuredLogger } from '../core/structured-logger.js';
import { EventTypes } from '../contracts/event-types.js';
import { createSuccessEnvelope, createErrorEnvelope, ServiceErrorCode } from '../contracts/service-envelope.js';
import { InMemorySensorRepository } from '../infrastructure/in-memory-sensor-repository.js';
import { FirestoreSensorRepository } from '../infrastructure/firestore-sensor-repository.js';
import { initializeFirestoreClient } from '../config/firebase-config.js';

export class TelemetryService {
  /**
   * @param {Object} dependencies
   * @param {import('./sensor-registry.js').SensorRegistry} dependencies.registry
   * @param {import('../core/event-bus.js').EventBus} dependencies.eventBus
   */
  constructor({ registry, eventBus }) {
    if (!registry) throw new TypeError('TelemetryService requires an injected SensorRegistry.');
    if (!eventBus) throw new TypeError('TelemetryService requires an injected EventBus.');

    this._registry = registry;
    this._eventBus = eventBus;
    this._logger = new StructuredLogger('TelemetryService');

    this._repository = new InMemorySensorRepository();
    this._firestoreRepo = null;
    this._isFirebaseLive = false;
    this._firestoreUnsubscribe = null;
    this._stationUnsubscribe = null;

    // Attach registry onChange listener to forward domain events to the EventBus
    this._registryUnsubscribe = this._registry.onChange(async (event, sensor) => {
      if (event === 'SENSOR_DISCOVERED') {
        await this._eventBus.publish(EventTypes.SENSOR_DISCOVERED, {
          sensorId: sensor.id,
          sensor
        }, { sourceService: 'TelemetryService' });
      } else {
        await this._eventBus.publish(EventTypes.TELEMETRY_INGESTED, {
          sensorId: sensor.id,
          sensor
        }, { sourceService: 'TelemetryService' });
      }
    });
  }

  get isLive() {
    return this._isFirebaseLive;
  }

  get registry() {
    return this._registry;
  }

  /**
   * Connects to Google Cloud Firestore in production mode.
   * Falls back to local in-memory repository if Firebase credentials are unavailable.
   * @returns {Promise<Object>} ServiceEnvelope
   */
  async connectPipeline() {
    try {
      const db = initializeFirestoreClient();
      if (db) {
        this._firestoreRepo = new FirestoreSensorRepository(db);
        this._registry.setRepository(this._firestoreRepo);
        this._isFirebaseLive = true;

        this._logger.info('Connected directly to Google Cloud Firestore (/sensors).');

        await this._eventBus.publish(EventTypes.STREAM_STATUS_CHANGED, {
          isLive: true,
          mode: 'FIRESTORE_LIVE',
          label: 'Production Telemetry · Firestore Live'
        }, { sourceService: 'TelemetryService' });

        // Subscribe to canonical /sensors collection
        this._firestoreUnsubscribe = this._firestoreRepo.subscribeAllSensors(async (remoteSensors) => {
          this._registry.syncFromRemoteSensors(remoteSensors);
          await this._eventBus.publish(EventTypes.TELEMETRY_INGESTED, {
            count: remoteSensors.length,
            timestamp: Date.now()
          }, { sourceService: 'TelemetryService' });
        });

        return createSuccessEnvelope({ mode: 'FIRESTORE_LIVE', isLive: true });
      }

      this._logger.warn('Firebase SDK uninitialized; using local in-memory repository.');
      this._registry.setRepository(this._repository);
      this._isFirebaseLive = false;

      await this._eventBus.publish(EventTypes.STREAM_STATUS_CHANGED, {
        isLive: false,
        mode: 'LOCAL_CACHE',
        label: 'Production Telemetry · Local Cache'
      }, { sourceService: 'TelemetryService' });

      return createSuccessEnvelope({ mode: 'LOCAL_CACHE', isLive: false });
    } catch (err) {
      this._logger.error('Failed to connect to Firestore pipeline:', err);
      this._isFirebaseLive = false;
      this._registry.setRepository(this._repository);

      await this._eventBus.publish(EventTypes.STREAM_STATUS_CHANGED, {
        isLive: false,
        mode: 'LOCAL_CACHE',
        label: 'Production Telemetry · Local Cache'
      }, { sourceService: 'TelemetryService' });

      return createErrorEnvelope(ServiceErrorCode.SERVICE_UNAVAILABLE, err.message, { isLive: false });
    }
  }

  /**
   * Subscribe to readings for a specific station mast.
   * @param {string} stationId
   */
  subscribeStationMast(stationId) {
    if (!this._isFirebaseLive || !this._firestoreRepo || !stationId) return;

    if (this._stationUnsubscribe) {
      this._stationUnsubscribe();
      this._stationUnsubscribe = null;
    }

    this._stationUnsubscribe = this._firestoreRepo.subscribeToStation(stationId, (remoteSensors) => {
      if (remoteSensors && remoteSensors.length > 0) {
        remoteSensors.forEach((s) => {
          const existing = this._registry.getSensor(s.id);
          if (existing) {
            const latest = s.getLatestReading();
            if (latest) {
              existing.addReading(latest.value, latest.timestampMs, latest.quality);
            }
          } else {
            this._registry.registerSensor(s);
          }
        });
      }
    });
  /**
   * Fetches full historical readings for a specific sensor on demand.
   * @param {string} sensorId
   * @param {number} [limit=100]
   * @returns {Promise<Array<Object>>}
   */
  async fetchSensorHistory(sensorId, limit = 100) {
    if (!this._firestoreRepo) return [];
    try {
      const readings = await this._firestoreRepo.fetchReadingsForSensor(sensorId, limit);
      const sensor = this._registry.getSensor(sensorId);
      if (sensor && readings && readings.length > 0) {
        readings.forEach((r) => {
          sensor.addReading(r.value, r.timestampMs, r.quality);
        });
      }
      return readings;
    } catch (err) {
      this._logger.warn(`Failed to fetch history for sensor ${sensorId}:`, err);
      return [];
    }
  }

  /**
   * Returns cryptographic system state proof.
   */
  getSystemStateProof() {
    return this._registry.getSystemStateProof();
  }

  /**
   * Resource cleanup (Rule 15).
   */
  dispose() {
    if (this._firestoreUnsubscribe) {
      this._firestoreUnsubscribe();
      this._firestoreUnsubscribe = null;
    }
    if (this._stationUnsubscribe) {
      this._stationUnsubscribe();
      this._stationUnsubscribe = null;
    }
    if (this._registryUnsubscribe) {
      this._registryUnsubscribe();
      this._registryUnsubscribe = null;
    }
  }
}
