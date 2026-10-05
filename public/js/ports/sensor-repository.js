/**
 * @fileoverview ISensorRepository Interface Port.
 * Defines the contract for sensor metadata and timeseries persistence.
 * Adheres to Clean Architecture Ports & Adapters (Principle 35) and Boundaries as Interfaces (Principle 37).
 */

/**
 * @interface ISensorRepository
 */
export class ISensorRepository {
  /**
   * Retrieves all sensors registered to a specific station.
   * @param {string} stationId
   * @returns {Promise<Array<import('../domain/sensor.js').Sensor>>}
   */
  async getSensorsByStation(stationId) {
    throw new Error('Method getSensorsByStation() must be implemented by concrete repository.');
  }

  /**
   * Retrieves a single sensor by station and sensor ID.
   * @param {string} stationId
   * @param {string} sensorId
   * @returns {Promise<import('../domain/sensor.js').Sensor|null>}
   */
  async getSensor(stationId, sensorId) {
    throw new Error('Method getSensor() must be implemented by concrete repository.');
  }

  /**
   * Persists or updates a sensor entity definition.
   * @param {import('../domain/sensor.js').Sensor} sensor
   * @returns {Promise<void>}
   */
  async saveSensor(sensor) {
    throw new Error('Method saveSensor() must be implemented by concrete repository.');
  }

  /**
   * Appends an immutable reading data point to a sensor's timeseries.
   * @param {string} stationId
   * @param {string} sensorId
   * @param {import('../domain/sensor-reading.js').SensorReading} reading
   * @returns {Promise<void>}
   */
  async appendReading(stationId, sensorId, reading) {
    throw new Error('Method appendReading() must be implemented by concrete repository.');
  }

  /**
   * Subscribes to real-time updates for all sensors of a station.
   * @param {string} stationId
   * @param {(sensors: Array<import('../domain/sensor.js').Sensor>) => void} onUpdate
   * @returns {() => void} Unsubscribe cleanup function (Resource Management, Principle 15).
   */
  subscribeToStation(stationId, onUpdate) {
    throw new Error('Method subscribeToStation() must be implemented by concrete repository.');
  }
}
