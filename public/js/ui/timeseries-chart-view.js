/**
 * Shamba Watch 2.0 — Timeseries Chart View Controller
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 */

import { APP_CONFIG } from '../config/app-config.js';

export class TimeseriesChartView {
  /**
   * @param {Object} dependencies
   * @param {import('../services/station-service.js').StationService} dependencies.stationService
   * @param {import('../services/analytics-service.js').AnalyticsService} dependencies.analyticsService
   * @param {import('../services/telemetry-service.js').TelemetryService} dependencies.telemetryService
   * @param {import('./dashboard-presenter.js').DashboardPresenter} dependencies.presenter
   */
  /**
   * @param {Object} dependencies
   * @param {import('../services/station-service.js').StationService} dependencies.stationService
   * @param {import('../services/analytics-service.js').AnalyticsService} dependencies.analyticsService
   * @param {import('../services/telemetry-service.js').TelemetryService} dependencies.telemetryService
   * @param {import('./dashboard-presenter.js').DashboardPresenter} dependencies.presenter
   * @param {(sensorId: string, windowMs?: number) => void} [dependencies.onOpenSensorModal]
   */
  constructor({ stationService, analyticsService, telemetryService, presenter, onOpenSensorModal = null }) {
    this._stationService = stationService;
    this._analyticsService = analyticsService;
    this._telemetryService = telemetryService;
    this._presenter = presenter;
    this._onOpenSensorModal = onOpenSensorModal;

    this._bindControls();
  }

  /**
   * Binds interactive buttons for time windowing and metric selection.
   * @private
   */
  _bindControls() {
    // Window Selector Buttons
    document.querySelectorAll('.ws-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.id === 'customWindowBtn') {
          const allStations = this._stationService.getActiveStations();
          const activeStationId = this._stationService.getActiveStationId() || allStations[0]?.id;
          const sensors = this._telemetryService.registry.getSensorsByStation(activeStationId);
          const activeSensorId = this._analyticsService.activeSensorId;
          const targetSensor = (activeSensorId && sensors.find((s) => s.id === activeSensorId)) || sensors[0];
          if (this._onOpenSensorModal && targetSensor) {
            this._onOpenSensorModal(targetSensor.id, this._analyticsService.activeWindowMs);
          }
          return;
        }

        document.querySelectorAll('.ws-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const win = btn.dataset.window;
        let windowMs = APP_CONFIG.TIME_WINDOWS.TWENTY_FOUR_HOURS;
        if (win === '1h') windowMs = APP_CONFIG.TIME_WINDOWS?.ONE_HOUR || 3600000;
        else if (win === '6h') windowMs = APP_CONFIG.TIME_WINDOWS?.SIX_HOURS || 21600000;
        else if (win === '7d') windowMs = APP_CONFIG.TIME_WINDOWS.SEVEN_DAYS;
        else if (win === '30d') windowMs = APP_CONFIG.TIME_WINDOWS.THIRTY_DAYS;
        else if (win === 'all') windowMs = 0; // ALL_TIME

        this._analyticsService.setWindow(windowMs);
      });
    });

    // Metric Selector Buttons
    document.querySelectorAll('.ms-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ms-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this._analyticsService.setMetricType(btn.dataset.metric);
      });
    });
  }

  /**
   * Updates the active metric button UI in response to external selection.
   * @param {string} metricType
   */
  setActiveMetricButton(metricType) {
    document.querySelectorAll('.ms-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.metric === metricType);
    });
  }

  /**
   * Renders the timeseries SVG chart and metadata strip.
   */
  render() {
    const svg = document.getElementById('chartSvg');
    if (!svg) return;

    const allStations = this._stationService.getActiveStations();
    const activeStationId = this._stationService.getActiveStationId() || (allStations[0]?.id ?? null);
    const activeMetricType = this._analyticsService.activeMetricType;
    const activeSensorId = this._analyticsService.activeSensorId;
    const activeWindowMs = this._analyticsService.activeWindowMs;

    const sensors = this._telemetryService.registry.getSensorsByStation(activeStationId);
    let targetSensor = null;
    if (activeSensorId) {
      targetSensor = sensors.find((s) => s.id === activeSensorId);
    }
    if (!targetSensor) {
      targetSensor = sensors.find((s) => s.metricDefinition.metricType === activeMetricType) || sensors[0];
    }

    const stripNameEl = document.getElementById('stripName');
    const stripSubEl = document.getElementById('stripSub');

    // Standby empty state if no active sensor
    if (!targetSensor) {
      const w = svg.clientWidth || 600;
      const h = svg.clientHeight || 100;
      const midY = h / 2;
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const shimmerBase = isLight ? '#EFECE3' : '#23201A';
      const shimmerAccent = isLight ? '#2E6D29' : '#7A9471';
      const gridLineColor = isLight ? 'rgba(221,214,200,0.7)' : 'rgba(53,49,42,0.45)';
      const textFillColor = isLight ? '#7D7667' : '#787060';

      svg.innerHTML = `
        <defs>
          <linearGradient id="chartSkeletonShimmer" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${shimmerBase}">
              <animate attributeName="offset" values="-1; 1" dur="2.4s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stop-color="${shimmerAccent}" stop-opacity="0.32">
              <animate attributeName="offset" values="-0.5; 1.5" dur="2.4s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stop-color="${shimmerBase}">
              <animate attributeName="offset" values="0; 2" dur="2.4s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>
        <line x1="0" y1="${h * 0.28}" x2="${w}" y2="${h * 0.28}" stroke="${gridLineColor}" stroke-dasharray="4,4" />
        <line x1="0" y1="${h * 0.72}" x2="${w}" y2="${h * 0.72}" stroke="${gridLineColor}" stroke-dasharray="4,4" />
        <path d="M 0 ${midY} Q ${w * 0.25} ${midY - 18}, ${w * 0.5} ${midY} T ${w} ${midY}" fill="none" stroke="url(#chartSkeletonShimmer)" stroke-width="2.5" stroke-linecap="round" />
        <text x="50%" y="${h - 12}" dominant-baseline="middle" text-anchor="middle" fill="${textFillColor}" font-family="var(--font-mono)" font-size="11" letter-spacing="0.5">
          Awaiting sensor readings in Firestore (/sensors)...
        </text>
      `;

      if (stripNameEl) stripNameEl.textContent = 'No Active Sensors';
      if (stripSubEl) stripSubEl.textContent = '0 samples recorded';
      return;
    }

    const w = svg.clientWidth || 600;
    const h = svg.clientHeight || 100;
    const geom = this._presenter.getSparklineGeometry(targetSensor.id, activeWindowMs, w, h);

    svg.innerHTML = `
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${geom.color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${geom.color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${geom.areaPath ? `<path d="${geom.areaPath}" fill="url(#chartGrad)" />` : ''}
      ${geom.linePath ? `<path d="${geom.linePath}" fill="none" stroke="${geom.color}" stroke-width="2" />` : ''}
      ${geom.points.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${geom.color}" opacity="0.7"/>`).join('')}
    `;

    const hwShort = targetSensor.id.replace(/^urn:shamba:station:[^:]+:sensor:/, '').replace(/^lora_/, '');
    if (stripNameEl) {
      stripNameEl.innerHTML = `
        <span class="strip-sensor-title">${targetSensor.metadata.name}</span>
        <span class="strip-hw-tag">#${hwShort}</span>
        <button type="button" class="btn-strip-deep-dive" id="btnStripDeepDive" title="Open Interactive Timeseries Inspector">Deep Dive ↗</button>
      `;
      const deepDiveBtn = stripNameEl.querySelector('#btnStripDeepDive');
      deepDiveBtn?.addEventListener('click', () => {
        if (this._onOpenSensorModal) {
          this._onOpenSensorModal(targetSensor.id, activeWindowMs);
        }
      });
    }

    if (stripSubEl) {
      const label = this._analyticsService.getWindowLabel(activeWindowMs);
      const readings = targetSensor.getTimeseries(activeWindowMs);
      const sampleCount = readings.length;
      const stats = targetSensor.getStatistics(activeWindowMs);
      const unit = targetSensor.metricDefinition.unitSymbol;

      if (sampleCount > 0) {
        stripSubEl.innerHTML = `
          <span>${label} · ${sampleCount} sample${sampleCount !== 1 ? 's' : ''}</span>
          <span class="strip-stats-chips">
            <span class="stat-chip">Min: <strong>${stats.min}${unit}</strong></span>
            <span class="stat-chip">Avg: <strong>${stats.avg}${unit}</strong></span>
            <span class="stat-chip">Max: <strong>${stats.max}${unit}</strong></span>
          </span>
        `;
      } else {
        stripSubEl.textContent = `${label} · 0 samples recorded`;
      }
    }
  }
}
