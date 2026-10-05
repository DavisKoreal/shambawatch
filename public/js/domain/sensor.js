/**
 * @fileoverview Sensor Aggregate Root Entity.
 * Core domain entity orchestrating metadata, measurement definitions, thresholds,
 * appendable timeseries readings, configurable windowing, and health evaluation.
 * Pure Clean Architecture Domain Entity with ZERO external framework dependencies (Principles 31, 32, 39).
 */

import { APP_CONFIG } from '../config/app-config.js';
import { SensorMetadata } from './sensor-metadata.js';
import { MetricDefinition } from './metric-definition.js';
import { ThresholdRule } from './threshold-rule.js';
import { SensorReading } from './sensor-reading.js';

export class Sensor {
  /**
   * @param {Object} params
   * @param {string} params.id - Globally unique sensor identifier (e.g. URN or UUID).
   * @param {string} params.stationId - Parent station identifier (e.g. 'ST-01').
   * @param {SensorMetadata} params.metadata - Sensor metadata instance.
   * @param {MetricDefinition} params.metricDefinition - Measurement schema and validation rules.
   * @param {ThresholdRule} [params.thresholds] - Alert and watch thresholds.
   * @param {Object} [params.hardwareConfig] - Bus/protocol configuration (e.g. Modbus address).
   * @param {number} [params.windowDurationMs] - Configurable time-series window (defaults to 24h).
   * @param {number} [params.maxBufferPoints] - Safety memory limit for local timeseries buffer.
   * @param {Array<SensorReading>} [params.initialReadings] - Optional historical readings array.
   */
  constructor({
    id,
    stationId,
    metadata,
    metricDefinition,
    thresholds = new ThresholdRule(),
    hardwareConfig = {},
    windowDurationMs = APP_CONFIG.TIME_WINDOWS.TWENTY_FOUR_HOURS,
    maxBufferPoints = APP_CONFIG.MAX_BUFFER_POINTS,
    initialReadings = [],
  }) {
    if (!id || typeof id !== 'string') {
      throw new TypeError('Sensor requires a valid id string.');
    }
    if (!stationId || typeof stationId !== 'string') {
      throw new TypeError('Sensor requires a valid stationId string.');
    }
    if (!(metadata instanceof SensorMetadata)) {
      throw new TypeError('Sensor requires an instance of SensorMetadata.');
    }
    if (!(metricDefinition instanceof MetricDefinition)) {
      throw new TypeError('Sensor requires an instance of MetricDefinition.');
    }

    this.id = id.trim();
    this.stationId = stationId.trim();
    this.metadata = metadata;
    this.metricDefinition = metricDefinition;
    this.thresholds = thresholds instanceof ThresholdRule ? thresholds : ThresholdRule.fromJSON(thresholds);
    this.hardwareConfig = { ...hardwareConfig };

    // Configurable Windowing (User Approved Decision)
    this.windowDurationMs = Math.max(60000, Number(windowDurationMs));
    this.maxBufferPoints = Math.max(10, Number(maxBufferPoints));

    /** @type {Array<SensorReading>} Appendable, chronologically ordered timeseries buffer */
    this._readings = [];

    // Current State Cache
    this.currentState = {
      latestValue: 0,
      lastSampledMs: 0,
      status: APP_CONFIG.HEALTH_STATUS.NOMINAL,
      delta: 0,
    };

    // Load initial readings if supplied
    if (Array.isArray(initialReadings) && initialReadings.length > 0) {
      initialReadings.forEach((reading) => {
        const item = reading instanceof SensorReading ? reading : SensorReading.fromJSON(reading);
        this._readings.push(item);
      });
      this._sortAndPruneReadings();
      this._updateCurrentStateFromLatest();
    }
  }

  // ==========================================================================
  // METADATA EXTENSIBILITY
  // ==========================================================================

  /**
   * Appends or updates an extra metadata attribute dynamically.
   * Fulfills user requirement: "this metadata can append an extra field to it".
   * @param {string} key
   * @param {any} value
   * @returns {Sensor} this instance for chaining.
   */
  appendMetadata(key, value) {
    this.metadata.appendAttribute(key, value);
    return this;
  }

  /**
   * Retrieves an appended metadata attribute.
   * @param {string} key
   * @param {any} [defaultValue=null]
   * @returns {any}
   */
  getMetadataAttribute(key, defaultValue = null) {
    return this.metadata.getAttribute(key, defaultValue);
  }

  // ==========================================================================
  // TIMESERIES & READING APPENDABILITY
  // ==========================================================================

  /**
   * Appends a new time-series data point to this sensor.
   * Fulfills user requirement: "schema that has a timestamp, it's a time series,
   * so it has a timestamp and a value, and it is also appendable".
   * 
   * @param {number} value - Measured physical value.
   * @param {number} [timestampMs=Date.now()] - Timestamp in Unix milliseconds.
   * @param {string} [quality='GOOD'] - Quality status code.
   * @returns {SensorReading} The created and appended immutable reading.
   */
  addReading(value, timestampMs = Date.now(), quality = APP_CONFIG.QUALITY_CODES.GOOD) {
    // Validate value boundary
    const effectiveQuality = this.metricDefinition.isValid(value)
      ? quality
      : APP_CONFIG.QUALITY_CODES.OUT_OF_BOUNDS;

    // Calculate delta relative to the most recent reading
    const previousReading = this.getLatestReading();
    const delta = previousReading ? Number((value - previousReading.value).toFixed(2)) : 0;

    // Instantiate immutable reading
    const reading = new SensorReading({
      sensorId: this.id,
      value: Number(value),
      timestampMs,
      quality: effectiveQuality,
      delta,
    });

    // Append to internal buffer
    this._readings.push(reading);
    this._sortAndPruneReadings();

    // Update current health and state
    this._updateCurrentStateFromLatest();

    return reading;
  }

  /**
   * Sets the active time-series window duration dynamically (Configurable Windowing).
   * @param {number} durationMs - Window duration in milliseconds (e.g. 24h, 7d, 30d).
   * @returns {Sensor} this instance for chaining.
   */
  setWindow(durationMs) {
    if (!durationMs || durationMs <= 0) {
      throw new RangeError('Window duration must be a positive number of milliseconds.');
    }
    this.windowDurationMs = Number(durationMs);
    this._sortAndPruneReadings();
    return this;
  }

  /**
   * Retrieves the latest reading recorded by this sensor.
   * @returns {SensorReading|null}
   */
  getLatestReading() {
    if (this._readings.length === 0) return null;
    return this._readings[this._readings.length - 1];
  }

  /**
   * Returns a copy of all current readings in the buffer.
   * @returns {Array<SensorReading>}
   */
  get readings() {
    return [...this._readings];
  }

  /**
   * Returns timeseries data points filtered for any requested time window.
   * @param {number} [windowDurationMs] - Optional override for window duration.
   * @returns {Array<SensorReading>}
   */
  getTimeseries(windowDurationMs = this.windowDurationMs) {
    if (this._readings.length === 0) return [];
    const cutoffMs = Date.now() - windowDurationMs;
    return this._readings.filter((r) => r.timestampMs >= cutoffMs);
  }

  /**
   * Computes statistical aggregates (min, max, avg, count) over the active window.
   * @param {number} [windowDurationMs]
   * @returns {{min: number, max: number, avg: number, count: number}}
   */
  getStatistics(windowDurationMs = this.windowDurationMs) {
    const points = this.getTimeseries(windowDurationMs);
    if (points.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }

    const values = points.map((p) => p.value);
    const sum = values.reduce((acc, v) => acc + v, 0);

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Number((sum / values.length).toFixed(this.metricDefinition.precision)),
      count: values.length,
    };
  }

  // ==========================================================================
  // HEALTH & THRESHOLD EVALUATION
  // ==========================================================================

  /**
   * Evaluates the health status of the sensor based on thresholds and recency.
   * @returns {'nominal' | 'watch' | 'alert' | 'offline'}
   */
  evaluateHealth() {
    const latest = this.getLatestReading();
    if (!latest) {
      return APP_CONFIG.HEALTH_STATUS.OFFLINE;
    }

    // Check for stale data (e.g. no reading for > 15 minutes)
    const STALE_TIMEOUT_MS = 15 * 60 * 1000;
    if (Date.now() - latest.timestampMs > STALE_TIMEOUT_MS) {
      return APP_CONFIG.HEALTH_STATUS.OFFLINE;
    }

    // Evaluate against threshold rules with hysteresis
    return this.thresholds.evaluate(latest.value, this.currentState.status);
  }

  /**
   * Convenience check if sensor is currently in alert status.
   * @returns {boolean}
   */
  isAlerting() {
    return this.currentState.status === APP_CONFIG.HEALTH_STATUS.ALERT;
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  /**
   * Sorts chronologically and prunes readings exceeding the window or buffer limit.
   * @private
   */
  _sortAndPruneReadings() {
    // Sort chronologically ascending
    this._readings.sort((a, b) => a.timestampMs - b.timestampMs);

    // Prune older than active window cutoff
    const cutoffMs = Date.now() - this.windowDurationMs;
    this._readings = this._readings.filter((r) => r.timestampMs >= cutoffMs);

    // Enforce safety buffer ceiling
    if (this._readings.length > this.maxBufferPoints) {
      this._readings = this._readings.slice(-this.maxBufferPoints);
    }
  }

  /**
   * Synchronizes the currentState cache with the latest reading.
   * @private
   */
  _updateCurrentStateFromLatest() {
    const latest = this.getLatestReading();
    if (latest) {
      this.currentState.latestValue = latest.value;
      this.currentState.lastSampledMs = latest.timestampMs;
      this.currentState.delta = latest.delta;
      this.currentState.status = this.evaluateHealth();
    }
  }

  // ==========================================================================
  // SERIALIZATION & FIRESTORE ADAPTER CONTRACTS
  // ==========================================================================

  /**
   * Serializes the sensor entity to a plain JSON / Firestore document format.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      stationId: this.stationId,
      metadata: this.metadata.toJSON(),
      metricDefinition: this.metricDefinition.toJSON(),
      thresholds: this.thresholds.toJSON(),
      hardwareConfig: this.hardwareConfig,
      windowDurationMs: this.windowDurationMs,
      currentState: { ...this.currentState },
    };
  }

  /**
   * Deserializes a Firestore document or JSON structure into a Sensor instance.
   * @param {Object} data
   * @param {Array<Object>} [readings=[]]
   * @returns {Sensor}
   */
  static fromJSON(data, readings = []) {
    if (!data || typeof data !== 'object') {
      throw new TypeError('Invalid JSON representation for Sensor.');
    }

    const stationId = data.stationId || data.metadata?.location?.stationId || data.metadata?.stationId || 'ST-FIELD';

    return new Sensor({
      id: data.id,
      stationId,
      metadata: SensorMetadata.fromJSON(data.metadata),
      metricDefinition: MetricDefinition.fromJSON(data.metricDefinition),
      thresholds: ThresholdRule.fromJSON(data.thresholds),
      hardwareConfig: data.hardwareConfig || {},
      windowDurationMs: data.windowDurationMs || APP_CONFIG.TIME_WINDOWS.TWENTY_FOUR_HOURS,
      initialReadings: readings.map((r) => SensorReading.fromJSON(r)),
    });
  }

  /**
   * Standard string representation.
   * @returns {string}
   */
  toString() {
    return `[Sensor ${this.id} (${this.metadata.name}) @ Station ${this.stationId}: ${this.currentState.latestValue}${this.metricDefinition.unitSymbol} - Status: ${this.currentState.status}]`;
  }
}
