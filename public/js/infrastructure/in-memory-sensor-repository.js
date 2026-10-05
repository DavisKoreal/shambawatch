/**
 * @fileoverview InMemorySensorRepository Adapter.
 * In-memory test double and local simulation storage implementing ISensorRepository.
 * Adheres to Mocking External Services (Principle 22), Test Fixture Isolation (Principle 23),
 * and Testable in Isolation (Principle 40).
 */

import { ISensorRepository } from '../ports/sensor-repository.js';
import { Logger } from '../config/app-config.js';

export class InMemorySensorRepository extends ISensorRepository {
  constructor() {
    super();
    /** @type {Map<string, import('../domain/sensor.js').Sensor>} sensorId -> Sensor */
    this._sensors = new Map();
    /** @type {Map<string, Set<(sensors: import('../domain/sensor.js').Sensor[]) => void>>} stationId -> Set<listener> */
    this._listeners = new Map();
  }

  /**
   * @param {string} stationId
   * @returns {Promise<Array<import('../domain/sensor.js').Sensor>>}
   */
  async getSensorsByStation(stationId) {
    const results = Array.from(this._sensors.values()).filter(
      (s) => s.stationId === stationId
    );
    return results;
  }

  /**
   * @param {string} stationId
   * @param {string} sensorId
   * @returns {Promise<import('../domain/sensor.js').Sensor|null>}
   */
  async getSensor(stationId, sensorId) {
    const sensor = this._sensors.get(sensorId);
    if (sensor && sensor.stationId === stationId) {
      return sensor;
    }
    return null;
  }

  /**
   * @param {import('../domain/sensor.js').Sensor} sensor
   * @returns {Promise<void>}
   */
  async saveSensor(sensor) {
    this._sensors.set(sensor.id, sensor);
    this._notifyListeners(sensor.stationId);
  }

  /**
   * @param {string} stationId
   * @param {string} sensorId
   * @param {import('../domain/sensor-reading.js').SensorReading} reading
   * @returns {Promise<void>}
   */
  async appendReading(stationId, sensorId, reading) {
    const sensor = await this.getSensor(stationId, sensorId);
    if (sensor) {
      sensor.addReading(reading.value, reading.timestampMs, reading.quality);
      this._notifyListeners(stationId);
    } else {
      Logger.warn('InMemorySensorRepository', `Cannot append reading: sensor ${sensorId} not found.`);
    }
  }

  /**
   * Subscribes to real-time updates for a station.
   * @param {string} stationId
   * @param {(sensors: Array<import('../domain/sensor.js').Sensor>) => void} onUpdate
   * @returns {() => void} Unsubscribe callback.
   */
  subscribeToStation(stationId, onUpdate) {
    if (!this._listeners.has(stationId)) {
      this._listeners.set(stationId, new Set());
    }
    const set = this._listeners.get(stationId);
    set.add(onUpdate);

    // Initial trigger
    this.getSensorsByStation(stationId).then((sensors) => onUpdate(sensors));

    // Cleanup unsubscribe function (Principle 15)
    return () => {
      set.delete(onUpdate);
      if (set.size === 0) {
        this._listeners.delete(stationId);
      }
    };
  }

  /**
   * @private
   */
  _notifyListeners(stationId) {
    if (!this._listeners.has(stationId)) return;
    const sensors = Array.from(this._sensors.values()).filter(
      (s) => s.stationId === stationId
    );
    this._listeners.get(stationId).forEach((listener) => {
      try {
        listener(sensors);
      } catch (err) {
        Logger.error('InMemorySensorRepository', 'Listener notification error:', err);
      }
    });
  }

  /**
   * Clears all in-memory data (for test isolation, Principle 23).
   */
  clear() {
    this._sensors.clear();
    this._listeners.clear();
  }
}
