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
    this._historyFetchedSensors = new Set();
    this._resizeTimeout = null;

    this._bindControls();

    // Auto re-render on window resize for responsive SVG charts
    window.addEventListener('resize', () => {
      if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => this.render(), 120);
    });
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
   * Renders the timeseries SVG chart and metadata strip with comprehensive labels,
   * axes, grid lines, and interactive tooltips.
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

    const w = svg.clientWidth || svg.parentElement?.clientWidth || 600;
    const h = svg.clientHeight || svg.parentElement?.clientHeight || 110;

    // Automatically retrieve old recorded history from Firestore for this sensor
    if (this._telemetryService && !this._historyFetchedSensors.has(targetSensor.id)) {
      this._historyFetchedSensors.add(targetSensor.id);
      this._telemetryService.fetchSensorHistory(targetSensor.id, 100).then((readings) => {
        if (readings && readings.length > 0) {
          this.render();
        }
      });
    }

    // Chart margins & bounded plotting box
    const padLeft = 48;
    const padRight = 36;
    const padTop = 14;
    const padBottom = 22;
    const plotW = Math.max(20, w - padLeft - padRight);
    const plotH = Math.max(20, h - padTop - padBottom);

    const metric = targetSensor.metricDefinition;
    const unit = metric.unitSymbol || '';
    const readings = targetSensor.getTimeseries(activeWindowMs);
    const minValid = metric.minValid ?? 0;
    const maxValid = metric.maxValid ?? 100;
    const range = (maxValid - minValid) || 1;
    const midVal = (minValid + maxValid) / 2;

    const colorPalette = {
      moisture: '#7A9471',
      water: '#4C87A6',
      nitrogen: '#C9A227',
      phosphorus: '#B5851F',
      potassium: '#8C6416',
      humidity: '#A69E8D',
      temp: '#C1622C',
    };
    const color = colorPalette[metric.metricType] || '#7A9471';

    // Compute coordinate points
    let points = [];
    let linePath = '';
    let areaPath = '';

    if (readings.length === 1) {
      const r = readings[0];
      const normY = Math.min(1, Math.max(0, (r.value - minValid) / range));
      const y = padTop + plotH - (normY * plotH);
      points = [{
        x: padLeft + plotW / 2,
        y,
        value: r.value,
        timestampMs: r.timestampMs,
        quality: r.quality,
        delta: r.delta ?? 0,
      }];
      linePath = `M ${padLeft},${y.toFixed(1)} L ${(padLeft + plotW).toFixed(1)},${y.toFixed(1)}`;
      areaPath = `M ${padLeft},${y.toFixed(1)} L ${(padLeft + plotW).toFixed(1)},${y.toFixed(1)} L ${(padLeft + plotW).toFixed(1)},${(padTop + plotH).toFixed(1)} L ${padLeft},${(padTop + plotH).toFixed(1)} Z`;
    } else if (readings.length > 1) {
      const stepX = plotW / (readings.length - 1);
      points = readings.map((r, idx) => {
        const x = padLeft + idx * stepX;
        const normY = Math.min(1, Math.max(0, (r.value - minValid) / range));
        const y = padTop + plotH - (normY * plotH);
        return {
          x,
          y,
          value: r.value,
          timestampMs: r.timestampMs,
          quality: r.quality,
          delta: r.delta ?? 0,
        };
      });

      linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      areaPath = `${linePath} L ${(padLeft + plotW).toFixed(1)},${(padTop + plotH).toFixed(1)} L ${padLeft},${(padTop + plotH).toFixed(1)} Z`;
    }

    // Y-Axis reference levels
    const yTop = padTop;
    const yMid = padTop + plotH / 2;
    const yBtm = padTop + plotH;

    // Safe range guideline positions
    const safeMinY = metric.minSafe != null ? padTop + plotH - (((metric.minSafe - minValid) / range) * plotH) : null;
    const safeMaxY = metric.maxSafe != null ? padTop + plotH - (((metric.maxSafe - minValid) / range) * plotH) : null;

    // X-Axis timestamps
    let startTimeLabel = '-24h';
    let midTimeLabel = '-12h';
    let endTimeLabel = 'Now';
    if (readings.length > 0) {
      const t0 = readings[0].timestampMs;
      const tEnd = readings[readings.length - 1].timestampMs;
      startTimeLabel = new Date(t0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      midTimeLabel = new Date(t0 + (tEnd - t0) / 2).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      endTimeLabel = `Now (${new Date(tEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    }

    // Latest point callout badge
    const latestPoint = points.length > 0 ? points[points.length - 1] : null;

    svg.style.cursor = 'pointer';
    svg.setAttribute('title', 'Click graph or Deep Dive button to inspect timeseries');

    svg.innerHTML = `
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.38"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- Y-Axis Horizontal Gridlines -->
      <line x1="${padLeft}" y1="${yTop}" x2="${padLeft + plotW}" y2="${yTop}" class="chart-grid-line" />
      <line x1="${padLeft}" y1="${yMid}" x2="${padLeft + plotW}" y2="${yMid}" class="chart-grid-line" />
      <line x1="${padLeft}" y1="${yBtm}" x2="${padLeft + plotW}" y2="${yBtm}" class="chart-axis-line" />

      <!-- Y-Axis Numerical Labels -->
      <text x="${padLeft - 6}" y="${yTop + 3}" text-anchor="end" class="chart-axis-label">${maxValid}${unit}</text>
      <text x="${padLeft - 6}" y="${yMid + 3}" text-anchor="end" class="chart-axis-label">${Math.round(midVal)}${unit}</text>
      <text x="${padLeft - 6}" y="${yBtm + 3}" text-anchor="end" class="chart-axis-label">${minValid}${unit}</text>

      <!-- Safe Threshold Guidelines (if defined) -->
      ${safeMaxY !== null ? `
        <line x1="${padLeft}" y1="${safeMaxY.toFixed(1)}" x2="${padLeft + plotW}" y2="${safeMaxY.toFixed(1)}" stroke="var(--nutrient)" class="chart-threshold-line" />
        <text x="${padLeft + 6}" y="${(safeMaxY - 3).toFixed(1)}" fill="var(--nutrient)" class="chart-axis-label" opacity="0.8">Safe Max (${metric.maxSafe}${unit})</text>
      ` : ''}
      ${safeMinY !== null ? `
        <line x1="${padLeft}" y1="${safeMinY.toFixed(1)}" x2="${padLeft + plotW}" y2="${safeMinY.toFixed(1)}" stroke="var(--nutrient)" class="chart-threshold-line" />
        <text x="${padLeft + 6}" y="${(safeMinY + 9).toFixed(1)}" fill="var(--nutrient)" class="chart-axis-label" opacity="0.8">Safe Min (${metric.minSafe}${unit})</text>
      ` : ''}

      <!-- X-Axis Baseline & Time Labels -->
      <line x1="${padLeft}" y1="${yBtm}" x2="${padLeft}" y2="${yBtm + 4}" class="chart-axis-line" />
      <line x1="${padLeft + plotW / 2}" y1="${yBtm}" x2="${padLeft + plotW / 2}" y2="${yBtm + 4}" class="chart-axis-line" />
      <line x1="${padLeft + plotW}" y1="${yBtm}" x2="${padLeft + plotW}" y2="${yBtm + 4}" class="chart-axis-line" />

      <text x="${padLeft}" y="${yBtm + 15}" text-anchor="start" class="chart-axis-label">${startTimeLabel}</text>
      <text x="${padLeft + plotW / 2}" y="${yBtm + 15}" text-anchor="middle" class="chart-axis-label">${midTimeLabel}</text>
      <text x="${padLeft + plotW}" y="${yBtm + 15}" text-anchor="end" class="chart-axis-label">${endTimeLabel}</text>

      <!-- Timeseries Area & Line Paths -->
      ${areaPath ? `<path d="${areaPath}" fill="url(#chartGrad)" />` : ''}
      ${linePath ? `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />` : ''}

      <!-- Interactive Data Points -->
      ${points.map((p, i) => `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="${color}" opacity="0.85" class="chart-point" data-point-idx="${i}" />
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="14" class="chart-point-hitbox" data-point-idx="${i}" />
      `).join('')}

      <!-- Latest Point Highlight & Value Pill -->
      ${latestPoint ? `
        <circle cx="${latestPoint.x.toFixed(1)}" cy="${latestPoint.y.toFixed(1)}" r="4.5" fill="none" stroke="${color}" stroke-width="1.5">
          <animate attributeName="r" values="3.5;7;3.5" dur="2.4s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2.4s" repeatCount="indefinite"/>
        </circle>
        <g transform="translate(${Math.min(latestPoint.x + 6, w - 42)}, ${Math.max(14, latestPoint.y - 8)})">
          <rect width="36" height="15" rx="3" fill="var(--panel-raised)" stroke="${color}" stroke-width="1" />
          <text x="18" y="11" text-anchor="middle" fill="var(--ink)" font-family="var(--font-mono)" font-size="9" font-weight="700">
            ${latestPoint.value}${unit}
          </text>
        </g>
      ` : ''}

      <!-- Interactive Tooltip Overlay (Populated on point hover/click) -->
      <g id="bottomChartTooltipGroup" style="display:none; pointer-events:none;">
        <rect id="bttBg" rx="5" fill="var(--panel-raised)" stroke="var(--hairline)" stroke-width="1" filter="drop-shadow(0 4px 10px rgba(0,0,0,0.5))" />
        <text id="bttTime" x="0" y="0" fill="var(--ink-dim)" font-family="var(--font-mono)" font-size="9"></text>
        <text id="bttValue" x="0" y="0" fill="var(--ink)" font-family="var(--font-mono)" font-size="11" font-weight="700"></text>
      </g>
    `;

    // Tooltip interaction on hover/touch
    const tooltipGroup = svg.querySelector('#bottomChartTooltipGroup');
    const bttBg = svg.querySelector('#bttBg');
    const bttTime = svg.querySelector('#bttTime');
    const bttValue = svg.querySelector('#bttValue');

    const showPointTooltip = (idx) => {
      const p = points[idx];
      if (!p || !tooltipGroup) return;

      const dateStr = new Date(p.timestampMs).toLocaleTimeString();
      const valStr = `${p.value}${unit} (${p.quality || 'GOOD'})`;

      bttTime.textContent = dateStr;
      bttValue.textContent = valStr;

      const boxW = Math.max(120, valStr.length * 7.5);
      const boxH = 34;
      const boxX = Math.max(padLeft, Math.min(w - boxW - 10, p.x - boxW / 2));
      const boxY = Math.max(4, p.y - boxH - 8);

      bttBg.setAttribute('x', boxX);
      bttBg.setAttribute('y', boxY);
      bttBg.setAttribute('width', boxW);
      bttBg.setAttribute('height', boxH);

      bttTime.setAttribute('x', boxX + 8);
      bttTime.setAttribute('y', boxY + 13);

      bttValue.setAttribute('x', boxX + 8);
      bttValue.setAttribute('y', boxY + 27);

      tooltipGroup.style.display = 'block';
    };

    const hidePointTooltip = () => {
      if (tooltipGroup) tooltipGroup.style.display = 'none';
    };

    svg.querySelectorAll('.chart-point-hitbox').forEach((hitbox) => {
      hitbox.addEventListener('mouseenter', (e) => {
        const idx = Number(e.target.dataset.pointIdx);
        showPointTooltip(idx);
      });
      hitbox.addEventListener('mouseleave', hidePointTooltip);
      hitbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(e.target.dataset.pointIdx);
        showPointTooltip(idx);
        // Also open sensor modal on point click
        if (this._onOpenSensorModal && targetSensor) {
          this._onOpenSensorModal(targetSensor.id, activeWindowMs);
        }
      });
    });

    // Clicking anywhere on the chart opens the full deep-dive sensor modal
    svg.onclick = (e) => {
      if (this._onOpenSensorModal && targetSensor) {
        this._onOpenSensorModal(targetSensor.id, activeWindowMs);
      }
    };

    const hwShort = targetSensor.id.replace(/^urn:shamba:station:[^:]+:sensor:/, '').replace(/^lora_/, '');
    if (stripNameEl) {
      stripNameEl.innerHTML = `
        <span class="strip-sensor-title">${targetSensor.metadata.name}</span>
        <span class="strip-hw-tag">#${hwShort}</span>
        <button type="button" class="btn-strip-deep-dive" id="btnStripDeepDive" title="Open Interactive Timeseries Inspector">Deep Dive ↗</button>
      `;
      const deepDiveBtn = stripNameEl.querySelector('#btnStripDeepDive');
      deepDiveBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onOpenSensorModal) {
          this._onOpenSensorModal(targetSensor.id, activeWindowMs);
        }
      });
    }

    if (stripSubEl) {
      const label = this._analyticsService.getWindowLabel(activeWindowMs);
      const sampleCount = readings.length;
      const stats = targetSensor.getStatistics(activeWindowMs);

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
