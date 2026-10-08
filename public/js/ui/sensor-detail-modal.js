/**
 * @fileoverview SensorDetailModal — Deep-Dive Timeseries Inspector & AI Telemetry Analysis.
 * Allows viewing complete timeseries data from any individual sensor, editing time periods
 * (presets & custom ranges), inspecting statistics, and receiving AI agronomic guidance.
 * Adheres to Rules 1 (SRP), 5 (Pure Functions), 6 (Low Complexity), and 34 (Interface Adapters).
 */

import { APP_CONFIG } from '../config/app-config.js';
import { StructuredLogger } from '../core/structured-logger.js';

export class SensorDetailModal {
  /**
   * @param {Object} dependencies
   * @param {import('../services/sensor-registry.js').SensorRegistry} dependencies.registry
   * @param {import('../services/analytics-service.js').AnalyticsService} dependencies.analyticsService
   * @param {import('./dashboard-presenter.js').DashboardPresenter} dependencies.presenter
   * @param {HTMLElement} dependencies.mountEl
   * @param {(query: string) => void} [dependencies.onOpenAiWithPrompt]
   */
  constructor({ registry, analyticsService, presenter, mountEl, onOpenAiWithPrompt }) {
    this._registry = registry;
    this._analyticsService = analyticsService;
    this._presenter = presenter;
    this._mountEl = mountEl;
    this._onOpenAiWithPrompt = onOpenAiWithPrompt;
    this._logger = new StructuredLogger('SensorDetailModal');

    this._sensorId = null;
    this._activeWindowMs = APP_CONFIG.TIME_WINDOWS.TWENTY_FOUR_HOURS;
    this._customStartMs = null;
    this._customEndMs = null;
    this._isOpen = false;

    this._render();
    this._bindEvents();
  }

  /**
   * Opens modal for a specific sensor.
   * @param {string} sensorId
   * @param {number} [windowMs]
   */
  open(sensorId, windowMs = null) {
    this._sensorId = sensorId;
    if (windowMs !== null) {
      this._activeWindowMs = windowMs;
    }
    this._isOpen = true;

    const overlay = this._mountEl.querySelector('#sensorModalOverlay');
    if (overlay) overlay.classList.add('open');

    this.renderContent();
  }

  /**
   * Closes the sensor detail modal.
   */
  close() {
    this._isOpen = false;
    const overlay = this._mountEl.querySelector('#sensorModalOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  /**
   * Initial modal shell render.
   * @private
   */
  _render() {
    this._mountEl.innerHTML = `
      <div class="shamba-modal-overlay sensor-modal-overlay" id="sensorModalOverlay" aria-modal="true" role="dialog">
        <div class="shamba-modal-content sensor-modal-box">
          <button class="shamba-modal-close" id="sensorModalCloseBtn" type="button" aria-label="Close dialog">×</button>
          
          <div class="sensor-modal-header" id="sensorModalHeader">
            <!-- Populated dynamically -->
          </div>

          <!-- TIME PERIOD SELECTOR & EDITOR -->
          <div class="sensor-time-controls">
            <div class="time-presets" id="sensorTimePresets">
              <span class="ctrl-label">Time Period:</span>
              <button class="time-btn" data-time="1h">1h</button>
              <button class="time-btn" data-time="6h">6h</button>
              <button class="time-btn active" data-time="24h">24h</button>
              <button class="time-btn" data-time="7d">7d</button>
              <button class="time-btn" data-time="30d">30d</button>
              <button class="time-btn" data-time="all">All Data</button>
            </div>
            
            <details class="custom-time-toggle">
              <summary>Custom Time Range...</summary>
              <div class="custom-time-fields">
                <div class="time-field">
                  <label for="custStart">Start Date/Time:</label>
                  <input type="datetime-local" id="custStart">
                </div>
                <div class="time-field">
                  <label for="custEnd">End Date/Time:</label>
                  <input type="datetime-local" id="custEnd">
                </div>
                <button type="button" class="btn-primary btn-xs" id="applyCustomTimeBtn">Apply Custom Range</button>
              </div>
            </details>
          </div>

          <!-- STATS SUMMARY CARDS -->
          <div class="sensor-stats-bar" id="sensorStatsBar">
            <!-- Populated dynamically -->
          </div>

          <!-- LARGE HIGH-RESOLUTION TIMESERIES SVG CHART -->
          <div class="sensor-chart-wrap">
            <div class="sensor-chart-title">
              <span id="chartRangeLabel">Last 24 Hours</span>
              <span class="chart-sample-count" id="chartSampleCount">0 readings</span>
            </div>
            <div class="sensor-svg-stage">
              <svg id="sensorModalSvg" width="100%" height="220" preserveAspectRatio="none"></svg>
            </div>
          </div>

          <!-- AI AGRONOMIC ADVISOR CARD -->
          <div class="sensor-ai-advisor" id="sensorAiAdvisor">
            <!-- Populated dynamically -->
          </div>

          <!-- RECENT READINGS DATA LOG -->
          <div class="sensor-readings-log-section">
            <div class="log-section-header">
              <h4>Recent Telemetry Samples</h4>
              <span id="logCountLabel">Latest readings recorded</span>
            </div>
            <div class="sensor-log-table-wrap">
              <table class="sensor-log-table">
                <thead>
                  <tr>
                    <th>Timestamp (EAT)</th>
                    <th>Reading Value</th>
                    <th>Delta vs Prev</th>
                    <th>Quality</th>
                    <th>Battery</th>
                  </tr>
                </thead>
                <tbody id="sensorLogTbody">
                  <!-- Populated dynamically -->
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  /**
   * Binds interaction listeners.
   * @private
   */
  _bindEvents() {
    const overlay = this._mountEl.querySelector('#sensorModalOverlay');
    const closeBtn = this._mountEl.querySelector('#sensorModalCloseBtn');

    closeBtn?.addEventListener('click', () => this.close());
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) this.close();
    });

    // Time Presets
    this._mountEl.querySelectorAll('.time-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._mountEl.querySelectorAll('.time-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const t = btn.dataset.time;

        if (t === '1h') this._activeWindowMs = APP_CONFIG.TIME_WINDOWS?.ONE_HOUR || 3600000;
        else if (t === '6h') this._activeWindowMs = APP_CONFIG.TIME_WINDOWS?.SIX_HOURS || 21600000;
        else if (t === '24h') this._activeWindowMs = APP_CONFIG.TIME_WINDOWS.TWENTY_FOUR_HOURS;
        else if (t === '7d') this._activeWindowMs = APP_CONFIG.TIME_WINDOWS.SEVEN_DAYS;
        else if (t === '30d') this._activeWindowMs = APP_CONFIG.TIME_WINDOWS.THIRTY_DAYS;
        else if (t === 'all') this._activeWindowMs = 0; // ALL_TIME

        this._customStartMs = null;
        this._customEndMs = null;
        this.renderContent();
      });
    });

    // Custom Time Range Apply
    const applyBtn = this._mountEl.querySelector('#applyCustomTimeBtn');
    applyBtn?.addEventListener('click', () => {
      const startInput = this._mountEl.querySelector('#custStart');
      const endInput = this._mountEl.querySelector('#custEnd');
      if (startInput?.value && endInput?.value) {
        this._customStartMs = new Date(startInput.value).getTime();
        this._customEndMs = new Date(endInput.value).getTime();
        this._mountEl.querySelectorAll('.time-btn').forEach((b) => b.classList.remove('active'));
        this.renderContent();
      }
    });
  }

  /**
   * Re-renders modal content with current sensor and time window data.
   */
  renderContent() {
    if (!this._sensorId) return;
    const sensor = this._registry.getSensor(this._sensorId);
    if (!sensor) return;

    const state = sensor.currentState;
    const metric = sensor.metricDefinition;
    const meta = sensor.metadata;

    // 1. Header
    const headerEl = this._mountEl.querySelector('#sensorModalHeader');
    if (headerEl) {
      const hardwareId = meta.hardwareId || meta.hardware?.hardwareId || sensor.id;
      headerEl.innerHTML = `
        <div class="sensor-header-top">
          <span class="status-pill status-${state.status}">${state.status.toUpperCase()}</span>
          <span class="sensor-id-tag">ID: ${hardwareId}</span>
          <span class="station-tag">📍 Station: ${sensor.stationId}</span>
        </div>
        <h3 class="sensor-modal-title">${meta.name}</h3>
        <p class="sensor-modal-desc">
          ${meta.description || `Field sensor monitoring ${metric.metricType} in ${meta.crop || 'soil'}.`}
          ${meta.minDepthCm !== null ? ` · Depth: <strong>${meta.minDepthCm}–${meta.maxDepthCm}cm</strong>` : ''}
        </p>
      `;
    }

    // 2. Filter readings by window or custom range
    let readings = [];
    let rangeLabel = '';

    if (this._customStartMs && this._customEndMs) {
      readings = sensor.readings.filter((r) => r.timestampMs >= this._customStartMs && r.timestampMs <= this._customEndMs);
      rangeLabel = `Custom: ${new Date(this._customStartMs).toLocaleDateString()} to ${new Date(this._customEndMs).toLocaleDateString()}`;
    } else {
      readings = sensor.getTimeseries(this._activeWindowMs);
      rangeLabel = this._analyticsService.getWindowLabel(this._activeWindowMs);
    }

    const rangeLabelEl = this._mountEl.querySelector('#chartRangeLabel');
    const sampleCountEl = this._mountEl.querySelector('#chartSampleCount');
    if (rangeLabelEl) rangeLabelEl.textContent = rangeLabel;
    if (sampleCountEl) sampleCountEl.textContent = `${readings.length} reading(s)`;

    // 3. Stats Bar
    const statsBarEl = this._mountEl.querySelector('#sensorStatsBar');
    if (statsBarEl) {
      const values = readings.map((r) => r.value);
      const minVal = values.length ? Math.min(...values) : 0;
      const maxVal = values.length ? Math.max(...values) : 0;
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = values.length ? (sum / values.length).toFixed(metric.precision) : 0;

      statsBarEl.innerHTML = `
        <div class="stat-pill">
          <span class="stat-title">Current</span>
          <strong class="stat-val" style="color:var(--ink);">${state.latestValue}${metric.unitSymbol}</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-title">Average</span>
          <strong class="stat-val">${avg}${metric.unitSymbol}</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-title">Min</span>
          <strong class="stat-val">${minVal}${metric.unitSymbol}</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-title">Max</span>
          <strong class="stat-val">${maxVal}${metric.unitSymbol}</strong>
        </div>
        <div class="stat-pill">
          <span class="stat-title">Battery</span>
          <strong class="stat-val" style="color:${state.batteryPct < 20 ? 'var(--earth)' : 'var(--moss)'};">${state.batteryPct != null ? `${Math.round(state.batteryPct)}%` : '—'}</strong>
        </div>
      `;
    }

    // 4. Render SVG Chart
    this._renderSvgChart(sensor, readings);

    // 5. AI Agronomic Advisor
    this._renderAiAdvisor(sensor, readings);

    // 6. Recent Readings Log
    this._renderReadingsTable(sensor, readings);
  }

  /**
   * Renders the timeseries SVG graph for the sensor.
   * @private
   */
  _renderSvgChart(sensor, readings) {
    const svg = this._mountEl.querySelector('#sensorModalSvg');
    if (!svg) return;

    const w = svg.clientWidth || 700;
    const h = svg.clientHeight || 220;
    const metric = sensor.metricDefinition;

    if (readings.length === 0) {
      svg.innerHTML = `
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="var(--ink-faint)" font-family="var(--font-mono)" font-size="12">
          No readings recorded in selected time window.
        </text>`;
      return;
    }

    const min = metric.minValid;
    const max = metric.maxValid;
    const range = (max - min) || 1;
    const color = APP_CONFIG.STATUS_COLORS[sensor.currentState.status] || '#7A9471';

    let linePath = '';
    let areaPath = '';
    let points = [];

    if (readings.length === 1) {
      const normalizedY = (readings[0].value - min) / range;
      const y = h - (normalizedY * (h - 30)) - 15;
      linePath = `M 0,${y.toFixed(1)} L ${w},${y.toFixed(1)}`;
      areaPath = `M 0,${y.toFixed(1)} L ${w},${y.toFixed(1)} L ${w},${h} L 0,${h} Z`;
      points = [[w / 2, y]];
    } else {
      const stepX = w / (readings.length - 1);
      points = readings.map((r, i) => {
        const x = i * stepX;
        const normalizedY = (r.value - min) / range;
        const y = h - (normalizedY * (h - 30)) - 15;
        return [Number(x.toFixed(1)), Number(y.toFixed(1))];
      });

      linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + `${p[0]},${p[1]}`).join(' ');
      areaPath = `${linePath} L${w},${h} L0,${h} Z`;
    }

    // Grid lines for reference thresholds
    const safeMinY = h - (((metric.minSafe - min) / range) * (h - 30)) - 15;
    const safeMaxY = h - (((metric.maxSafe - min) / range) * (h - 30)) - 15;

    svg.innerHTML = `
      <defs>
        <linearGradient id="modalGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- Safe Threshold Guidelines -->
      <line x1="0" y1="${safeMaxY.toFixed(1)}" x2="${w}" y2="${safeMaxY.toFixed(1)}" stroke="var(--nutrient)" stroke-dasharray="3,3" opacity="0.4"/>
      <text x="8" y="${(safeMaxY - 4).toFixed(1)}" fill="var(--nutrient)" font-size="9" font-family="var(--font-mono)" opacity="0.7">Safe Max (${metric.maxSafe}${metric.unitSymbol})</text>
      
      <line x1="0" y1="${safeMinY.toFixed(1)}" x2="${w}" y2="${safeMinY.toFixed(1)}" stroke="var(--nutrient)" stroke-dasharray="3,3" opacity="0.4"/>
      <text x="8" y="${(safeMinY + 11).toFixed(1)}" fill="var(--nutrient)" font-size="9" font-family="var(--font-mono)" opacity="0.7">Safe Min (${metric.minSafe}${metric.unitSymbol})</text>

      <!-- Timeseries Area & Line -->
      <path d="${areaPath}" fill="url(#modalGrad)"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- Data point markers -->
      ${points.map((p, i) => {
        const r = readings[i];
        return `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${color}" stroke="var(--bg)" stroke-width="1.5">
          <title>${r ? `${new Date(r.timestampMs).toLocaleTimeString()}: ${r.value}${metric.unitSymbol}` : ''}</title>
        </circle>`;
      }).join('')}
    `;
  }

  /**
   * Generates tailored AI explanation for the farmer.
   * @private
   */
  _renderAiAdvisor(sensor, readings) {
    const aiEl = this._mountEl.querySelector('#sensorAiAdvisor');
    if (!aiEl) return;

    const val = sensor.currentState.latestValue;
    const unit = sensor.metricDefinition.unitSymbol;
    const type = sensor.metricDefinition.metricType;
    const status = sensor.currentState.status;
    const crop = sensor.metadata.crop || 'crops';

    let adviceText = '';
    if (type === 'moisture') {
      if (status === 'nominal') {
        adviceText = `Soil moisture is at a healthy ${val}${unit}. Root zone hydration is optimal for ${crop} growth. Evapotranspiration is stable and no supplementary irrigation is recommended today.`;
      } else if (val < sensor.metricDefinition.minSafe) {
        adviceText = `⚠️ Soil moisture has dropped to ${val}${unit}, below the minimum safe threshold of ${sensor.metricDefinition.minSafe}${unit}. To prevent crop stress in your ${crop}, schedule drip irrigation within the next 4–6 hours.`;
      } else {
        adviceText = `⚠️ Moisture is elevated at ${val}${unit}. Check field drainage channels to avoid root waterlogging and hypoxia.`;
      }
    } else if (type === 'temp') {
      adviceText = `Thermal reading is ${val}${unit}. Soil temperatures remain within standard metabolic ranges for ${crop}.`;
    } else if (type === 'water') {
      adviceText = `Basin water level reads ${val}${unit}. Reservoir capacity is adequate for farm irrigation cycles.`;
    } else {
      adviceText = `${sensor.metadata.name} is currently reading ${val}${unit} (${status.toUpperCase()}). All physical thresholds are being monitored continuously.`;
    }

    aiEl.innerHTML = `
      <div class="ai-advisor-header">
        <span class="ai-sparkle">✦</span>
        <strong>Shamba AI Agronomic Insight for Farmer</strong>
      </div>
      <p class="ai-advisor-body">${adviceText}</p>
      <div class="ai-advisor-actions">
        <button class="btn-ai-prompt" id="btnAskAiAboutThisSensor" type="button">
          Ask AI: "What actions should I take for this sensor?"
        </button>
      </div>
    `;

    const askBtn = aiEl.querySelector('#btnAskAiAboutThisSensor');
    askBtn?.addEventListener('click', () => {
      this.close();
      const prompt = `Explain the reading of ${val}${unit} on my ${sensor.metadata.name} (${sensor.id}) for ${crop}. What specific actions or irrigation should I take?`;
      if (this._onOpenAiWithPrompt) {
        this._onOpenAiWithPrompt(prompt);
      }
    });
  }

  /**
   * Renders the recent readings table.
   * @private
   */
  _renderReadingsTable(sensor, readings) {
    const tbody = this._mountEl.querySelector('#sensorLogTbody');
    if (!tbody) return;

    if (readings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No telemetry readings recorded.</td></tr>';
      return;
    }

    // Show up to 15 most recent readings in reverse chronological order
    const slice = [...readings].reverse().slice(0, 15);
    tbody.innerHTML = slice.map((r) => {
      const timeStr = new Date(r.timestampMs).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = new Date(r.timestampMs).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
      const deltaStr = r.delta != null ? (r.delta >= 0 ? `+${r.delta.toFixed(1)}` : `${r.delta.toFixed(1)}`) : '0.0';
      const batteryStr = r.batteryPct != null ? `${Math.round(r.batteryPct)}%` : '—';

      return `
        <tr>
          <td>${dateStr} ${timeStr}</td>
          <td><strong>${r.value}</strong> <span style="font-size:10px; opacity:0.6;">${sensor.metricDefinition.unitSymbol}</span></td>
          <td style="color:${r.delta >= 0 ? 'var(--moss)' : 'var(--earth)'}; font-family:var(--font-mono); font-size:11px;">${deltaStr}</td>
          <td><span class="quality-badge quality-${r.quality?.toLowerCase() || 'good'}">${r.quality || 'GOOD'}</span></td>
          <td style="font-family:var(--font-mono); font-size:11px;">${batteryStr}</td>
        </tr>
      `;
    }).join('');
  }
}
