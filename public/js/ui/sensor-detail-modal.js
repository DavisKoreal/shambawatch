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
   * @param {import('../services/telemetry-service.js').TelemetryService} [dependencies.telemetryService]
   * @param {import('./dashboard-presenter.js').DashboardPresenter} dependencies.presenter
   * @param {HTMLElement} dependencies.mountEl
   * @param {(query: string) => void} [dependencies.onOpenAiWithPrompt]
   */
  constructor({ registry, analyticsService, telemetryService = null, presenter, mountEl, onOpenAiWithPrompt }) {
    this._registry = registry;
    this._analyticsService = analyticsService;
    this._telemetryService = telemetryService;
    this._presenter = presenter;
    this._mountEl = mountEl;
    this._onOpenAiWithPrompt = onOpenAiWithPrompt;
    this._logger = new StructuredLogger('SensorDetailModal');

    this._sensorId = null;
    this._activeWindowMs = APP_CONFIG.TIME_WINDOWS.TWENTY_FOUR_HOURS;
    this._customStartMs = null;
    this._customEndMs = null;
    this._isOpen = false;
    this._resizeTimeout = null;

    this._render();
    this._bindEvents();

    window.addEventListener('resize', () => {
      if (this._isOpen && this._sensorId) {
        if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
        this._resizeTimeout = setTimeout(() => this.renderContent(), 120);
      }
    });
  }

  /**
   * Opens modal for a specific sensor.
   * @param {string} sensorId
   * @param {number} [windowMs]
   */
  async open(sensorId, windowMs = null) {
    this._sensorId = sensorId;
    if (windowMs !== null) {
      this._activeWindowMs = windowMs;
    }
    this._isOpen = true;

    const overlay = this._mountEl.querySelector('#sensorModalOverlay');
    if (overlay) overlay.classList.add('open');

    this.renderContent();

    if (this._telemetryService) {
      await this._telemetryService.fetchSensorHistory(sensorId, 100);
      if (this._isOpen && this._sensorId === sensorId) {
        this.renderContent();
      }
    }
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
   * Renders the timeseries SVG graph for the sensor with complete Y/X axis labels,
   * safe range guidelines, timestamp ticks, and interactive click point inspector.
   * @private
   */
  _renderSvgChart(sensor, readings) {
    const svg = this._mountEl.querySelector('#sensorModalSvg');
    if (!svg) return;

    const w = svg.clientWidth || svg.parentElement?.clientWidth || 700;
    const h = svg.clientHeight || 220;
    const metric = sensor.metricDefinition;
    const unit = metric.unitSymbol || '';

    if (readings.length === 0) {
      svg.innerHTML = `
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="var(--ink-faint)" font-family="var(--font-mono)" font-size="12">
          No telemetry readings recorded in selected time period.
        </text>`;
      return;
    }

    const padLeft = 56;
    const padRight = 28;
    const padTop = 22;
    const padBottom = 34;
    const plotW = Math.max(20, w - padLeft - padRight);
    const plotH = Math.max(20, h - padTop - padBottom);

    const min = metric.minValid ?? 0;
    const max = metric.maxValid ?? 100;
    const range = (max - min) || 1;
    const color = APP_CONFIG.STATUS_COLORS[sensor.currentState.status] || '#7A9471';

    // 5 Y-Axis reference levels
    const yLevels = [1.0, 0.75, 0.5, 0.25, 0.0];
    const yTicks = yLevels.map((lvl) => {
      const y = padTop + plotH * (1 - lvl);
      const val = min + lvl * range;
      const label = `${val.toFixed(metric.precision > 0 ? 1 : 0)}${unit}`;
      return { y, val, label, isBase: lvl === 0 };
    });

    // Safe Range Guidelines
    const hasSafeRange = metric.minSafe != null && metric.maxSafe != null;
    let safeMaxY = null;
    let safeMinY = null;
    if (hasSafeRange) {
      const normSafeMax = Math.min(1, Math.max(0, (metric.maxSafe - min) / range));
      const normSafeMin = Math.min(1, Math.max(0, (metric.minSafe - min) / range));
      safeMaxY = padTop + plotH * (1 - normSafeMax);
      safeMinY = padTop + plotH * (1 - normSafeMin);
    }

    // Compute coordinate points
    let points = [];
    let linePath = '';
    let areaPath = '';

    if (readings.length === 1) {
      const r = readings[0];
      const normY = Math.min(1, Math.max(0, (r.value - min) / range));
      const y = padTop + plotH - (normY * plotH);
      points = [{
        x: padLeft + plotW / 2,
        y,
        value: r.value,
        timestampMs: r.timestampMs,
        quality: r.quality || 'GOOD',
        delta: r.delta ?? 0,
        batteryPct: r.batteryPct ?? sensor.currentState.batteryPct,
      }];
      linePath = `M ${padLeft},${y.toFixed(1)} L ${(padLeft + plotW).toFixed(1)},${y.toFixed(1)}`;
      areaPath = `M ${padLeft},${y.toFixed(1)} L ${(padLeft + plotW).toFixed(1)},${y.toFixed(1)} L ${(padLeft + plotW).toFixed(1)},${(padTop + plotH).toFixed(1)} L ${padLeft},${(padTop + plotH).toFixed(1)} Z`;
    } else {
      const stepX = plotW / (readings.length - 1);
      points = readings.map((r, i) => {
        const x = padLeft + i * stepX;
        const normY = Math.min(1, Math.max(0, (r.value - min) / range));
        const y = padTop + plotH - (normY * plotH);
        return {
          x,
          y,
          value: r.value,
          timestampMs: r.timestampMs,
          quality: r.quality || 'GOOD',
          delta: r.delta ?? 0,
          batteryPct: r.batteryPct ?? sensor.currentState.batteryPct,
        };
      });

      linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      areaPath = `${linePath} L ${(padLeft + plotW).toFixed(1)},${(padTop + plotH).toFixed(1)} L ${padLeft},${(padTop + plotH).toFixed(1)} Z`;
    }

    // 5 X-Axis Time Ticks
    const tStart = readings[0].timestampMs;
    const tEnd = readings[readings.length - 1].timestampMs;
    const isMultiDay = (tEnd - tStart) > 86400000;
    const xTickRatios = [0, 0.25, 0.5, 0.75, 1];
    const xTicks = xTickRatios.map((ratio) => {
      const tickX = padLeft + ratio * plotW;
      const tickTime = tStart + ratio * (tEnd - tStart || 1);
      const timeStr = isMultiDay
        ? `${new Date(tickTime).toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${new Date(tickTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : new Date(tickTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { x: tickX, timeStr, ratio };
    });

    const baselineY = padTop + plotH;

    svg.innerHTML = `
      <defs>
        <linearGradient id="modalGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>

      <!-- Safe Range Background Band -->
      ${hasSafeRange && safeMaxY !== null && safeMinY !== null ? `
        <rect x="${padLeft}" y="${Math.min(safeMaxY, safeMinY)}" width="${plotW}" height="${Math.abs(safeMinY - safeMaxY)}" fill="var(--moss)" fill-opacity="0.07" rx="2" />
      ` : ''}

      <!-- Y-Axis Gridlines & Ticks -->
      ${yTicks.map((t) => `
        <line x1="${padLeft}" y1="${t.y.toFixed(1)}" x2="${(padLeft + plotW).toFixed(1)}" y2="${t.y.toFixed(1)}" stroke="var(--hairline)" stroke-dasharray="${t.isBase ? 'none' : '3,3'}" opacity="${t.isBase ? '1' : '0.6'}" />
        <text x="${(padLeft - 8).toFixed(1)}" y="${(t.y + 3).toFixed(1)}" text-anchor="end" fill="var(--ink-faint)" font-family="var(--font-mono)" font-size="10">${t.label}</text>
      `).join('')}

      <!-- Safe Threshold Guidelines -->
      ${safeMaxY !== null ? `
        <line x1="${padLeft}" y1="${safeMaxY.toFixed(1)}" x2="${(padLeft + plotW).toFixed(1)}" y2="${safeMaxY.toFixed(1)}" stroke="var(--nutrient)" stroke-dasharray="4,4" opacity="0.85"/>
        <text x="${padLeft + 8}" y="${(safeMaxY - 4).toFixed(1)}" fill="var(--nutrient)" font-size="9" font-family="var(--font-mono)" opacity="0.9">Safe Max (${metric.maxSafe}${unit})</text>
      ` : ''}
      ${safeMinY !== null ? `
        <line x1="${padLeft}" y1="${safeMinY.toFixed(1)}" x2="${(padLeft + plotW).toFixed(1)}" y2="${safeMinY.toFixed(1)}" stroke="var(--nutrient)" stroke-dasharray="4,4" opacity="0.85"/>
        <text x="${padLeft + 8}" y="${(safeMinY + 11).toFixed(1)}" fill="var(--nutrient)" font-size="9" font-family="var(--font-mono)" opacity="0.9">Safe Min (${metric.minSafe}${unit})</text>
      ` : ''}

      <!-- X-Axis Baseline & Notches -->
      <line x1="${padLeft}" y1="${baselineY}" x2="${padLeft + plotW}" y2="${baselineY}" stroke="var(--hairline)" stroke-width="1" />
      ${xTicks.map((xt) => `
        <line x1="${xt.x.toFixed(1)}" y1="${baselineY}" x2="${xt.x.toFixed(1)}" y2="${baselineY + 5}" stroke="var(--hairline)" stroke-width="1" />
        <text x="${xt.x.toFixed(1)}" y="${baselineY + 18}" text-anchor="${xt.ratio === 0 ? 'start' : xt.ratio === 1 ? 'end' : 'middle'}" fill="var(--ink-faint)" font-family="var(--font-mono)" font-size="10">${xt.timeStr}</text>
      `).join('')}

      <!-- Timeseries Area & Line -->
      ${areaPath ? `<path d="${areaPath}" fill="url(#modalGrad)"/>` : ''}
      ${linePath ? `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}

      <!-- Interactive Data Points -->
      ${points.map((p, i) => `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${color}" stroke="var(--bg)" stroke-width="1.5" class="modal-chart-point" data-idx="${i}" />
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="16" fill="transparent" class="modal-chart-hitbox" data-idx="${i}" style="cursor:pointer;" />
      `).join('')}

      <!-- Interactive Point Inspector Overlays -->
      <g id="modalInspectorOverlay" style="display:none; pointer-events:none;">
        <line id="inspCrosshair" x1="0" y1="${padTop}" x2="0" y2="${baselineY}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.8" />
        <circle id="inspHalo" cx="0" cy="0" r="7" fill="none" stroke="${color}" stroke-width="2">
          <animate attributeName="r" values="5;9;5" dur="1.8s" repeatCount="indefinite"/>
        </circle>
        <g id="inspCardGroup">
          <rect id="inspCardBg" rx="6" fill="var(--panel-raised)" stroke="var(--hairline)" stroke-width="1" filter="drop-shadow(0 6px 16px rgba(0,0,0,0.65))" />
          <text id="inspLine1" x="0" y="0" fill="var(--ink-dim)" font-family="var(--font-mono)" font-size="9"></text>
          <text id="inspLine2" x="0" y="0" fill="var(--ink)" font-family="var(--font-mono)" font-size="12" font-weight="700"></text>
          <text id="inspLine3" x="0" y="0" fill="var(--ink-dim)" font-family="var(--font-mono)" font-size="9"></text>
        </g>
      </g>
    `;

    // Bind interactive inspection handlers
    const overlay = svg.querySelector('#modalInspectorOverlay');
    const crosshair = svg.querySelector('#inspCrosshair');
    const halo = svg.querySelector('#inspHalo');
    const cardBg = svg.querySelector('#inspCardBg');
    const line1 = svg.querySelector('#inspLine1');
    const line2 = svg.querySelector('#inspLine2');
    const line3 = svg.querySelector('#inspLine3');

    const inspectPoint = (idx) => {
      const p = points[idx];
      if (!p || !overlay) return;

      const dateStr = new Date(p.timestampMs).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const fullDate = new Date(p.timestampMs).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });
      const valStr = `${p.value}${unit} (${sensor.metadata.name})`;
      const detailStr = `Quality: ${p.quality} · Delta: ${p.delta >= 0 ? '+' : ''}${p.delta} · Batt: ${p.batteryPct != null ? `${Math.round(p.batteryPct)}%` : '—'}`;

      crosshair.setAttribute('x1', p.x);
      crosshair.setAttribute('x2', p.x);

      halo.setAttribute('cx', p.x);
      halo.setAttribute('cy', p.y);

      line1.textContent = `${fullDate} ${dateStr} EAT`;
      line2.textContent = valStr;
      line3.textContent = detailStr;

      const cardW = Math.max(180, Math.max(valStr.length * 7.5, detailStr.length * 5.8));
      const cardH = 54;
      const cardX = Math.max(padLeft, Math.min(w - cardW - 10, p.x - cardW / 2));
      const cardY = Math.max(6, p.y - cardH - 12);

      cardBg.setAttribute('x', cardX);
      cardBg.setAttribute('y', cardY);
      cardBg.setAttribute('width', cardW);
      cardBg.setAttribute('height', cardH);

      line1.setAttribute('x', cardX + 10);
      line1.setAttribute('y', cardY + 16);

      line2.setAttribute('x', cardX + 10);
      line2.setAttribute('y', cardY + 32);

      line3.setAttribute('x', cardX + 10);
      line3.setAttribute('y', cardY + 46);

      overlay.style.display = 'block';

      // Highlight matching row in the table below
      const tableRows = this._mountEl.querySelectorAll('#sensorLogTbody tr');
      tableRows.forEach((tr) => tr.style.backgroundColor = '');
      const matchingRow = this._mountEl.querySelector(`#sensorLogTbody tr[data-timestamp="${p.timestampMs}"]`);
      if (matchingRow) {
        matchingRow.style.backgroundColor = 'rgba(122, 148, 113, 0.22)';
        matchingRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };

    const clearInspection = () => {
      if (overlay) overlay.style.display = 'none';
      const tableRows = this._mountEl.querySelectorAll('#sensorLogTbody tr');
      tableRows.forEach((tr) => tr.style.backgroundColor = '');
    };

    svg.querySelectorAll('.modal-chart-hitbox').forEach((hitbox) => {
      hitbox.addEventListener('mouseenter', (e) => {
        const idx = Number(e.target.dataset.idx);
        inspectPoint(idx);
      });
      hitbox.addEventListener('mouseleave', clearInspection);
      hitbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(e.target.dataset.idx);
        inspectPoint(idx);
      });
    });
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
   * Renders the recent readings table with data-timestamp attributes for bi-directional linking.
   * @private
   */
  _renderReadingsTable(sensor, readings) {
    const tbody = this._mountEl.querySelector('#sensorLogTbody');
    if (!tbody) return;

    if (readings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No telemetry readings recorded.</td></tr>';
      return;
    }

    // Show up to 20 most recent readings in reverse chronological order
    const slice = [...readings].reverse().slice(0, 20);
    tbody.innerHTML = slice.map((r) => {
      const timeStr = new Date(r.timestampMs).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = new Date(r.timestampMs).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
      const deltaStr = r.delta != null ? (r.delta >= 0 ? `+${r.delta.toFixed(1)}` : `${r.delta.toFixed(1)}`) : '0.0';
      const batteryStr = r.batteryPct != null ? `${Math.round(r.batteryPct)}%` : '—';

      return `
        <tr data-timestamp="${r.timestampMs}">
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
