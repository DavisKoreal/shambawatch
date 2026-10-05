/**
 * @fileoverview SensorReading Value Object.
 * Represents an immutable, single time-series data point in the sensor telemetry stream.
 * Adheres to User Specification ("schema that has a timestamp, it's a time series, has a timestamp and a value, appendable"),
 * Immutable Data Pattern, and Standard Method Overrides (Principle 20).
 */

export class SensorReading {
  /**
   * @param {Object} params
   * @param {string} params.sensorId - ID of the originating sensor.
   * @param {number} params.value - The physical measured value.
   * @param {number} [params.timestampMs] - Millisecond Unix epoch timestamp (defaults to Date.now()).
   * @param {string} [params.quality='GOOD'] - Telemetry data quality code ('GOOD', 'SUSPECT', 'OUT_OF_BOUNDS', 'FAULT').
   * @param {number} [params.delta=0] - Difference relative to the preceding reading.
   * @param {string} [params.id] - Optional unique reading identifier.
   */
  constructor({
    sensorId,
    value,
    timestampMs = Date.now(),
    quality = 'GOOD',
    delta = 0,
    id = '',
  }) {
    if (!sensorId || typeof sensorId !== 'string') {
      throw new TypeError('SensorReading requires a valid sensorId string.');
    }
    if (value === null || value === undefined || typeof value !== 'number' || Number.isNaN(value)) {
      throw new TypeError(`SensorReading requires a valid numeric value, received: ${value}`);
    }

    this.sensorId = sensorId;
    this.value = value;
    this.timestampMs = Number(timestampMs);
    this.timestampISO = new Date(this.timestampMs).toISOString();
    this.quality = quality;
    this.delta = Number(delta);
    this.id = id || `${this.timestampMs}_${sensorId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    // Enforce immutability on this timeseries point (Principle 24 & Hypothesis 24)
    Object.freeze(this);
  }

  /**
   * Predicate checking if the reading has good telemetry quality.
   * @returns {boolean}
   */
  isHealthy() {
    return this.quality === 'GOOD';
  }

  /**
   * Serializes the reading to a plain JSON object.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      sensorId: this.sensorId,
      value: this.value,
      timestampMs: this.timestampMs,
      timestampISO: this.timestampISO,
      quality: this.quality,
      delta: this.delta,
    };
  }

  /**
   * Deserializes a plain JSON object into a SensorReading.
   * @param {Object} data
   * @returns {SensorReading}
   */
  static fromJSON(data) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('Invalid JSON representation for SensorReading.');
    }
    return new SensorReading(data);
  }

  /**
   * Human-readable string representation.
   * @returns {string}
   */
  toString() {
    return `[SensorReading ${this.id} @ ${this.timestampISO}: ${this.value} (delta: ${this.delta >= 0 ? '+' : ''}${this.delta})]`;
  }
}
