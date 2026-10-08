/**
 * Shamba Watch 2.0 — Analytics Service (Agronomic Analytics Bounded Context)
 * Adheres to Rules 1 (SRP), 5 (Pure Functions), 13 (Consistent Return Types),
 * 46 (Event-Driven), and 54 (Bounded Context).
 */

import { APP_CONFIG } from '../config/app-config.js';
import { EventTypes } from '../contracts/event-types.js';
import { createSuccessEnvelope } from '../contracts/service-envelope.js';
import { StructuredLogger } from '../core/structured-logger.js';

export class AnalyticsService {
  /**
   * @param {Object} [dependencies={}]
   * @param {import('./sensor-registry.js').SensorRegistry} [dependencies.registry]
   * @param {import('../core/event-bus.js').EventBus} [dependencies.eventBus]
   */
  constructor({ registry = null, eventBus = null } = {}) {
    this._registry = registry;
    this._eventBus = eventBus;
    this._logger = new StructuredLogger('AnalyticsService');

    this._activeMetricType = 'moisture';
    this._activeSensorId = null;
    this._activeWindowMs = APP_CONFIG.TIME_WINDOWS ? APP_CONFIG.TIME_WINDOWS.TWENTY_FOUR_HOURS : 86400000;
  }

  get activeMetricType() {
    return this._activeMetricType;
  }

  get activeSensorId() {
    return this._activeSensorId;
  }

  get activeWindowMs() {
    return this._activeWindowMs;
  }

  /**
   * Focuses a specific individual sensor for telemetry and timeseries graphing.
   * @param {string|null} sensorId
   */
  async setActiveSensorId(sensorId) {
    this._activeSensorId = sensorId;
    if (sensorId && this._registry) {
      const sensor = this._registry.getSensor(sensorId);
      if (sensor) {
        this._activeMetricType = sensor.metricDefinition.metricType;
      }
    }

    await this._eventBus.publish(EventTypes.SENSOR_SELECTED, {
      sensorId,
      metricType: this._activeMetricType
    }, { sourceService: 'AnalyticsService' });

    return createSuccessEnvelope({ sensorId, metricType: this._activeMetricType });
  }

  /**
   * Set active time window and notify listeners.
   * @param {number} windowMs
   */
  async setWindow(windowMs) {
    this._activeWindowMs = windowMs;
    // Propagate window change to all sensors in the registry
    if (this._registry) {
      this._registry.getAllSensors().forEach((s) => s.setWindow(windowMs));
    }

    await this._eventBus.publish(EventTypes.WINDOW_CHANGED, {
      windowMs,
      label: this.getWindowLabel(windowMs)
    }, { sourceService: 'AnalyticsService' });

    return createSuccessEnvelope({ windowMs });
  }

  /**
   * Set active metric type and notify listeners.
   * @param {string} metricType
   */
  async setMetricType(metricType) {
    this._activeMetricType = metricType;
    this._activeSensorId = null; // Reset explicit sensor focus to allow metric grouping

    await this._eventBus.publish(EventTypes.METRIC_CHANGED, {
      metricType
    }, { sourceService: 'AnalyticsService' });

    return createSuccessEnvelope({ metricType });
  }

  /**
   * Pure function: returns human-readable label for a window duration.
   * @param {number} windowMs
   * @returns {string}
   */
  getWindowLabel(windowMs) {
    switch (windowMs) {
      case APP_CONFIG.TIME_WINDOWS?.ONE_HOUR:
        return 'Last 1 Hour';
      case APP_CONFIG.TIME_WINDOWS?.SIX_HOURS:
        return 'Last 6 Hours';
      case APP_CONFIG.TIME_WINDOWS?.TWENTY_FOUR_HOURS:
        return 'Last 24 Hours';
      case APP_CONFIG.TIME_WINDOWS?.SEVEN_DAYS:
        return 'Last 7 Days';
      case APP_CONFIG.TIME_WINDOWS?.THIRTY_DAYS:
        return 'Last 30 Days';
      case APP_CONFIG.TIME_WINDOWS?.ALL_TIME:
      case 0:
        return 'All Recorded History';
      default:
        if (windowMs < 3600000) return `${Math.round(windowMs / 60000)}m Window`;
        if (windowMs < 86400000) return `${Math.round(windowMs / 3600000)}h Window`;
        return `${Math.round(windowMs / 86400000)}d Window`;
    }
  }

  /**
   * Pure function: calculates mean volumetric soil moisture across all moisture sensors.
   * @returns {string}
   */
  calculateMeanMoisture() {
    const moistureSensors = this._registry.getSensorsByMetric('moisture');
    if (moistureSensors.length === 0) return 'N/A';
    const sum = moistureSensors.reduce((acc, s) => acc + (s.currentState?.latestValue || 0), 0);
    return (sum / moistureSensors.length).toFixed(1);
  }

  /**
   * Pure function: computes SVG sparkline geometry from timeseries samples.
   * @param {string} sensorId
   * @param {number} windowMs
   * @param {number} width
   * @param {number} height
   * @returns {{ linePath: string, areaPath: string, points: Array<[number, number]>, color: string }}
   */
  getSparklineGeometry(sensorId, windowMs, width, height) {
    const sensor = this._registry.getSensor(sensorId);
    if (!sensor) {
      return { linePath: '', areaPath: '', points: [], color: '#7A9471' };
    }

    const points = sensor.getTimeseries(windowMs);
    const color = APP_CONFIG.STATUS_COLORS[sensor.currentState.status] || '#7A9471';

    if (points.length === 0) {
      return { linePath: '', areaPath: '', points: [], color };
    }

    if (points.length === 1) {
      const y = height / 2;
      return {
        linePath: `M 0 ${y} L ${width} ${y}`,
        areaPath: `M 0 ${y} L ${width} ${y} L ${width} ${height} L 0 ${height} Z`,
        points: [[width / 2, y]],
        color
      };
    }

    const values = points.map((p) => p.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = (maxVal - minVal) || 1;

    const padTop = 14;
    const padBottom = 14;
    const effH = Math.max(1, height - padTop - padBottom);

    const coords = points.map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - padBottom - ((p.value - minVal) / range) * effH;
      return [x, y];
    });

    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

    return { linePath, areaPath, points: coords, color };
  }

  /**
   * Pure function: calculates descriptive statistics for an array of timeseries readings.
   * @param {Array<{ value: number, timestampMs?: number }|number>} readings
   * @returns {{ min: number, max: number, avg: number, count: number }}
   */
  computeSummaryStats(readings = []) {
    if (!readings || readings.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }
    const vals = readings.map(r => (typeof r === 'number' ? r : r.value));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = Number((sum / vals.length).toFixed(2));
    return { min, max, avg, count: vals.length };
  }

  /**
   * Pure function: creates an SVG line path for an array of numerical values.
   * @param {number[]} values
   * @param {number} width
   * @param {number} height
   * @returns {string} SVG path string
   */
  generateSparklinePath(values = [], width = 100, height = 40) {
    if (!values || values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = (max - min) || 1;
    const pad = 4;
    const effH = Math.max(1, height - pad * 2);

    return values.map((val, i) => {
      const x = ((i / (values.length - 1)) * width).toFixed(1);
      const y = (height - pad - ((val - min) / range) * effH).toFixed(1);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }
}
