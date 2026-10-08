/**
 * Shamba Watch 2.0 — Alert Service (Monitoring & Diagnostics Bounded Context)
 * Adheres to Rules 1 (SRP), 46 (Event-Driven), and 54 (Bounded Context).
 */

import { APP_CONFIG } from '../config/app-config.js';
import { EventTypes } from '../contracts/event-types.js';
import { createSuccessEnvelope } from '../contracts/service-envelope.js';
import { StructuredLogger } from '../core/structured-logger.js';

export class AlertService {
  /**
   * @param {Object} dependencies
   * @param {import('./sensor-registry.js').SensorRegistry} dependencies.registry
   * @param {import('../core/event-bus.js').EventBus} dependencies.eventBus
   */
  constructor({ registry, eventBus }) {
    if (!registry) throw new TypeError('AlertService requires an injected SensorRegistry.');
    if (!eventBus) throw new TypeError('AlertService requires an injected EventBus.');

    this._registry = registry;
    this._eventBus = eventBus;
    this._logger = new StructuredLogger('AlertService');
  }

  /**
   * Returns count of all active critical alerts across reporting sensors.
   * @returns {number}
   */
  getTotalAlertCount() {
    const allSensors = this._registry.getAllSensors();
    return allSensors.filter((s) => s.currentState?.status === APP_CONFIG.HEALTH_STATUS.ALERT).length;
  }

  /**
   * Returns all sensors currently in ALERT or WATCH status.
   * @returns {{ alerts: Array<Object>, watches: Array<Object> }}
   */
  getDiagnosticViolations() {
    const allSensors = this._registry.getAllSensors();
    return {
      alerts: allSensors.filter((s) => s.currentState?.status === APP_CONFIG.HEALTH_STATUS.ALERT),
      watches: allSensors.filter((s) => s.currentState?.status === APP_CONFIG.HEALTH_STATUS.WATCH)
    };
  }

  /**
   * Inspects incoming sensor readings and emits alert events if thresholds are exceeded.
   * @param {Object} sensor
   */
  async evaluateSensor(sensor) {
    if (!sensor || !sensor.currentState) return;

    if (sensor.currentState.status === APP_CONFIG.HEALTH_STATUS.ALERT) {
      await this._eventBus.publish(EventTypes.ALERT_TRIGGERED, {
        sensorId: sensor.id,
        stationId: sensor.stationId,
        sensorName: sensor.metadata?.name,
        value: sensor.currentState.latestValue,
        unit: sensor.metricDefinition?.unitSymbol,
        status: APP_CONFIG.HEALTH_STATUS.ALERT
      }, { sourceService: 'AlertService' });
    }
  }
}
