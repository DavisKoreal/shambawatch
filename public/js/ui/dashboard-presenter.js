/**
 * @fileoverview DashboardPresenter.
 * Maps domain entities and registry state into structured View Models for UI rendering.
 * Adheres to Presenter / View Model Pattern (Principle 38) and Separation of Concerns (Principle 2).
 */

import { APP_CONFIG } from '../config/app-config.js';

export class DashboardPresenter {
  /**
   * @param {import('../services/sensor-registry.js').SensorRegistry} registry
   */
  constructor(registry) {
    if (!registry) {
      throw new TypeError('DashboardPresenter requires a SensorRegistry instance.');
    }
    this._registry = registry;
  }

  /**
   * Builds the view model for the Station Sidebar items.
   * @param {Array<Object>} stationSpecs - List of station coordinates and metadata.
   * @param {string} activeStationId - ID of the currently selected station.
   * @returns {Array<Object>}
   */
  getStationListViewModels(stationSpecs, activeStationId) {
    return stationSpecs.map((spec) => {
      const sensors = this._registry.getSensorsByStation(spec.id);
      const statuses = sensors.map((s) => s.currentState.status);

      // Station status is worst-case of its sensors
      let overallStatus = APP_CONFIG.HEALTH_STATUS.NOMINAL;
      if (statuses.includes(APP_CONFIG.HEALTH_STATUS.ALERT)) {
        overallStatus = APP_CONFIG.HEALTH_STATUS.ALERT;
      } else if (statuses.includes(APP_CONFIG.HEALTH_STATUS.WATCH)) {
        overallStatus = APP_CONFIG.HEALTH_STATUS.WATCH;
      }

      return {
        id: spec.id,
        name: spec.name,
        crop: spec.crop,
        sensorCount: sensors.length,
        status: overallStatus,
        isActive: spec.id === activeStationId,
        color: this.getStatusColor(overallStatus),
      };
    });
  }

  /**
   * Builds the view model for the station metric cards.
   * @param {string} stationId
   * @returns {Array<Object>}
   */
  getMetricCardViewModels(stationId) {
    const sensors = this._registry.getSensorsByStation(stationId);
    
    // Desired primary dashboard metrics order
    const priorityMetrics = ['water', 'moisture', 'nitrogen', 'humidity', 'temp', 'phosphorus', 'potassium'];
    
    // Sort sensors by priority
    const sorted = [...sensors].sort((a, b) => {
      const idxA = priorityMetrics.indexOf(a.metricDefinition.metricType);
      const idxB = priorityMetrics.indexOf(b.metricDefinition.metricType);
      return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
    });

    return sorted.map((sensor) => {
      const state = sensor.currentState;
      const metric = sensor.metricDefinition;
      const delta = state.delta || 0;
      const isUp = delta >= 0;

      return {
        sensorId: sensor.id,
        name: sensor.metadata.name,
        metricType: metric.metricType,
        value: state.latestValue,
        unit: metric.unitSymbol,
        formattedValue: metric.format(state.latestValue),
        status: state.status,
        statusColor: this.getStatusColor(state.status),
        deltaFormatted: `${isUp ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} vs prev`,
        deltaDirectionClass: isUp ? 'up' : 'down',
        depthInfo: sensor.metadata.minDepthCm !== null
          ? `${sensor.metadata.minDepthCm}–${sensor.metadata.maxDepthCm}cm`
          : null,
      };
    });
  }

  /**
   * Builds the view model for the Soil Core Stratigraphy slice.
   * Extracts sensors with declared depth ranges (0-40cm).
   * @param {string} stationId
   * @returns {Array<Object>}
   */
  getSoilCoreViewModels(stationId) {
    const sensors = this._registry.getSensorsByStation(stationId);
    
    // Filter sensors with depth definitions
    const depthSensors = sensors.filter(
      (s) => s.metadata.minDepthCm !== null && s.metadata.maxDepthCm !== null
    );

    // Color mapping by depth and metric
    const colorMap = {
      humidity: '#4C87A6', // Basin Blue
      moisture: '#7A9471', // Moss Green
      nitrogen: '#C9A227', // Nitrogen Gold
      phosphorus: '#B5851F',
      potassium: '#8C6416',
    };

    return depthSensors.map((s) => {
      const val = s.currentState.latestValue;
      const pct = Math.min(100, Math.max(5, val));
      const type = s.metricDefinition.metricType;
      const color = colorMap[type] || '#726B5C';

      return {
        sensorId: s.id,
        name: `${s.metadata.name} (${s.metadata.minDepthCm}–${s.metadata.maxDepthCm}cm)`,
        valueFormatted: `${Math.round(val)}${s.metricDefinition.unitSymbol}`,
        pct,
        color,
        opacity: 0.35 + (pct / 100) * 0.65,
      };
    });
  }

  /**
   * Computes the SVG sparkline geometry for any sensor over a specific window.
   * Adheres to Configurable Windowing (User Approved Decision).
   * 
   * @param {string} sensorId
   * @param {number} windowDurationMs
   * @param {number} width - SVG viewBox width.
   * @param {number} height - SVG viewBox height.
   * @returns {{linePath: string, areaPath: string, points: Array<[number, number]>, color: string}}
   */
  getSparklineGeometry(sensorId, windowDurationMs, width = 600, height = 100) {
    const sensor = this._registry.getSensor(sensorId);
    if (!sensor) {
      return { linePath: '', areaPath: '', points: [], color: '#7A9471' };
    }

    const readings = sensor.getTimeseries(windowDurationMs);
    const metricType = sensor.metricDefinition.metricType;

    const colorPalette = {
      moisture: '#7A9471',
      water: '#4C87A6',
      nitrogen: '#C9A227',
      phosphorus: '#B5851F',
      potassium: '#8C6416',
      humidity: '#A69E8D',
      temp: '#C1622C',
    };
    const color = colorPalette[metricType] || '#7A9471';

    if (readings.length < 2) {
      return { linePath: '', areaPath: '', points: [], color };
    }

    const min = sensor.metricDefinition.minValid;
    const max = sensor.metricDefinition.maxValid;
    const range = max - min || 1;
    const stepX = width / (readings.length - 1);

    const points = readings.map((r, idx) => {
      const x = idx * stepX;
      const normalizedY = (r.value - min) / range;
      const y = height - (normalizedY * (height - 10)) - 5;
      return [Number(x.toFixed(1)), Number(y.toFixed(1))];
    });

    const linePath = points
      .map((p, i) => (i === 0 ? 'M' : 'L') + `${p[0]},${p[1]}`)
      .join(' ');

    const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

    return { linePath, areaPath, points, color };
  }

  /**
   * Returns count of active alerts across all registered sensors.
   * @returns {number}
   */
  getTotalActiveAlertCount() {
    return this._registry
      .getAllSensors()
      .filter((s) => s.isAlerting()).length;
  }

  /**
   * Pure mapping from HealthStatus to semantic color.
   * @param {string} status
   * @returns {string}
   */
  getStatusColor(status) {
    switch (status) {
      case APP_CONFIG.HEALTH_STATUS.ALERT:
        return APP_CONFIG.THEME_COLORS.ALERT;
      case APP_CONFIG.HEALTH_STATUS.WATCH:
        return APP_CONFIG.THEME_COLORS.WATCH;
      default:
        return APP_CONFIG.THEME_COLORS.NOMINAL;
    }
  }
}
