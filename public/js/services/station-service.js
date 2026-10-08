/**
 * Shamba Watch 2.0 — Station Service (Station Management Bounded Context)
 * Adheres to Rules 1 (SRP), 2 (SoC), 13 (Consistent Return Types),
 * 15 (Resource Management), 46 (Event-Driven), and 54 (Bounded Context).
 */

import { StructuredLogger } from '../core/structured-logger.js';
import { EventBus } from '../core/event-bus.js';
import { EventTypes } from '../contracts/event-types.js';
import { createSuccessEnvelope, createErrorEnvelope, ServiceErrorCode } from '../contracts/service-envelope.js';
import { SensorRegistry } from './sensor-registry.js';
import { InMemorySensorRepository } from '../infrastructure/in-memory-sensor-repository.js';
import { Sensor } from '../domain/sensor.js';
import { SensorMetadata } from '../domain/sensor-metadata.js';
import { MetricDefinition } from '../domain/metric-definition.js';

/**
 * Known baseline geographical masts across the Rift Valley Basin.
 * Used strictly for enriching stations when active sensors are registered for their ID.
 * Stations with 0 sensors are never returned in public station listings.
 */
export const STATION_METADATA_CATALOG = Object.freeze([
  { id: 'ST-01', name: 'Naivasha North Plot', lat: -0.6980, lng: 36.4200, crop: 'Flower greenhouse' },
  { id: 'ST-02', name: 'Ol Kalou Maize Block', lat: -0.2760, lng: 36.3730, crop: 'Maize' },
  { id: 'ST-03', name: 'Nakuru Basin Wetland', lat: -0.3670, lng: 36.0800, crop: 'Wetland buffer' },
  { id: 'ST-04', name: 'Molo Highland Terrace', lat: -0.2470, lng: 35.7330, crop: 'Tea' },
  { id: 'ST-05', name: 'Elementaita Rangeland', lat: -0.4550, lng: 36.2500, crop: 'Grazing / rangeland' },
  { id: 'ST-06', name: 'Gilgil River Intake', lat: -0.5020, lng: 36.3190, crop: 'Irrigation intake' }
]);

export class StationService {
  /**
   * @param {Object} [dependencies={}]
   * @param {import('./sensor-registry.js').SensorRegistry} [dependencies.registry]
   * @param {import('../core/event-bus.js').EventBus} [dependencies.eventBus]
   * @param {Array<Object>} [dependencies.catalog=STATION_METADATA_CATALOG]
   */
  constructor({ registry, eventBus, catalog = STATION_METADATA_CATALOG } = {}) {
    this._registry = registry || new SensorRegistry(new InMemorySensorRepository());
    this._eventBus = eventBus || new EventBus();
    this._catalog = catalog;

    /** @type {string|null} */
    this._activeStationId = null;
    this._userManuallySelected = false;

    this._logger = new StructuredLogger('StationService');
  }

  /**
   * Registers a sensor into the underlying sensor registry (supports raw object or Sensor aggregate).
   * @param {Object|Sensor} sensorData
   */
  async registerSensor(sensorData) {
    if (sensorData instanceof Sensor) {
      return await this._registry.registerSensor(sensorData);
    }
    const meta = new SensorMetadata({
      id: sensorData.id,
      name: sensorData.name || sensorData.id,
      stationId: sensorData.stationId || 'st-01',
      stationName: sensorData.stationName || 'Station',
      location: {
        lat: sensorData.lat || -0.6980,
        lng: sensorData.lng || 36.4200,
        altitudeMeters: sensorData.altitudeMeters || 1880,
        depthCm: sensorData.depthCm || 15
      }
    });
    const def = new MetricDefinition({
      id: `metric-${sensorData.metric || 'moisture'}`,
      metricType: sensorData.metric || 'moisture',
      unit: sensorData.unit || '%',
      minSafe: 0,
      maxSafe: 100
    });
    const sensor = new Sensor({
      id: sensorData.id,
      stationId: sensorData.stationId || 'ST-01',
      metadata: meta,
      metricDefinition: def
    });
    return await this._registry.registerSensor(sensor);
  }

  /**
   * Returns all stations that have active reporting sensors (sensorCount > 0).
   * Stations with 0 sensors are strictly filtered out.
   * @returns {Array<Object>}
   */
  getActiveStations() {
    const discovered = this._registry.getStations(this._catalog);
    return discovered.filter((station) => station.sensorCount > 0);
  }

  /**
   * Returns standard service response envelope for active stations.
   * @returns {Object} ServiceEnvelope
   */
  listStations() {
    const stations = this.getActiveStations();
    return createSuccessEnvelope(stations);
  }

  /**
   * Gets a single station by ID if active.
   * @param {string} stationId
   * @returns {Object} ServiceEnvelope
   */
  getStationById(stationId) {
    if (!stationId) {
      return createErrorEnvelope(ServiceErrorCode.INVALID_ARGUMENT, 'stationId is required.');
    }
    const stations = this.getActiveStations();
    const station = stations.find((s) => s.id === stationId);
    if (!station) {
      return createErrorEnvelope(ServiceErrorCode.NOT_FOUND, `Station [${stationId}] is not active or has 0 reporting sensors.`);
    }
    return createSuccessEnvelope(station);
  }

  /**
   * Returns currently active station ID.
   * @returns {string|null}
   */
  getActiveStationId() {
    return this._activeStationId;
  }

  /**
   * Sets the active station and publishes a STATION_SELECTED event.
   * @param {string} stationId
   * @param {boolean} [isUserAction=true]
   * @returns {Promise<Object>}
   */
  async selectStation(stationId, isUserAction = true) {
    if (isUserAction) {
      this._userManuallySelected = true;
    }

    this._activeStationId = stationId;
    this._logger.info(`Active station selected: ${stationId} (User action: ${isUserAction})`);

    const activeStations = this.getActiveStations();
    const stationSpec = activeStations.find((s) => s.id === stationId) || null;

    await this._eventBus.publish(EventTypes.STATION_SELECTED, {
      stationId,
      station: stationSpec,
      isUserAction
    }, { sourceService: 'StationService' });

    return createSuccessEnvelope({ stationId, station: stationSpec });
  }

  /**
   * Synchronizes active station ID when topology updates.
   * If current active station is missing or has 0 sensors, falls back to the first available station.
   */
  syncActiveSelection() {
    const activeStations = this.getActiveStations();
    if (!this._userManuallySelected || !activeStations.some((s) => s.id === this._activeStationId)) {
      this._activeStationId = activeStations.length > 0 ? activeStations[0].id : null;
    }
    return this._activeStationId;
  }

  /**
   * Resource disposal (Rule 15).
   */
  dispose() {
    this._activeStationId = null;
    this._userManuallySelected = false;
  }
}
