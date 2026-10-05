/**
 * @fileoverview TelemetrySimulator Service.
 * Decoupled background service generating realistic sensor drift and dispatching readings.
 * Adheres to Resource Management (Principle 15) and Single Responsibility Principle (Principle 1).
 */

import { APP_CONFIG, Logger } from '../config/app-config.js';

export class TelemetrySimulator {
  /**
   * @param {import('./sensor-registry.js').SensorRegistry} registry
   * @param {number} [intervalMs]
   */
  constructor(registry, intervalMs = APP_CONFIG.DEFAULT_SAMPLE_INTERVAL_MS) {
    if (!registry) {
      throw new TypeError('TelemetrySimulator requires a SensorRegistry instance.');
    }
    this._registry = registry;
    this._intervalMs = intervalMs;
    /** @type {any|null} */
    this._timerId = null;
    this._isRunning = false;
  }

  /**
   * Starts the simulation cycle.
   */
  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._timerId = setInterval(() => this.tick(), this._intervalMs);
    Logger.info('TelemetrySimulator', `Simulation started with interval ${this._intervalMs}ms.`);
  }

  /**
   * Stops the simulation cycle and releases the interval timer (Principle 15).
   */
  stop() {
    if (!this._isRunning) return;
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
    this._isRunning = false;
    Logger.info('TelemetrySimulator', 'Simulation stopped.');
  }

  /**
   * Checks if simulator is actively running.
   * @returns {boolean}
   */
  isRunning() {
    return this._isRunning;
  }

  /**
   * Executes a single simulation step across all registered sensors.
   */
  tick() {
    const sensors = this._registry.getAllSensors();
    const now = Date.now();

    sensors.forEach((sensor) => {
      const current = sensor.currentState.latestValue;
      const metricType = sensor.metricDefinition.metricType;

      let delta = 0;
      if (metricType === 'temp') {
        delta = (Math.random() * 0.8 - 0.4); // +/- 0.4 °C
      } else if (metricType === 'humidity') {
        delta = (Math.random() * 3.0 - 1.5);
      } else {
        delta = (Math.random() * 4.0 - 2.0); // moisture, nutrients, water
      }

      const nextRaw = current + delta;
      const nextClamped = sensor.metricDefinition.clamp(
        Number(nextRaw.toFixed(sensor.metricDefinition.precision))
      );

      // Record reading in registry and repository
      this._registry.recordReading(sensor.id, nextClamped, now);
    });
  }
}
