/**
 * Shamba Watch 2.0 — Telemetry Detail View Controller
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 */

export class TelemetryDetailView {
  /**
   * @param {Object} dependencies
   * @param {import('../services/station-service.js').StationService} dependencies.stationService
   * @param {import('../services/telemetry-service.js').TelemetryService} dependencies.telemetryService
   * @param {import('./dashboard-presenter.js').DashboardPresenter} dependencies.presenter
   */
  constructor({ stationService, telemetryService, presenter }) {
    this._stationService = stationService;
    this._telemetryService = telemetryService;
    this._presenter = presenter;
  }

  /**
   * Renders the telemetry detail pane.
   */
  render() {
    const activeStationId = this._stationService.getActiveStationId();
    const allStations = this._stationService.getActiveStations();
    const stationSpec = allStations.find((s) => s.id === activeStationId) || allStations[0];

    const detTitleEl = document.getElementById('detTitle');
    const detCoordsEl = document.getElementById('detCoords');
    const metricGridEl = document.getElementById('metricGrid');
    const coreSampleEl = document.getElementById('coreSample');
    const coreReadoutsEl = document.getElementById('coreReadouts');
    const camTempEl = document.getElementById('camTemp');
    const camIdEl = document.getElementById('camId');
    const alertCountEl = document.getElementById('alertCount');

    if (!stationSpec) {
      if (detTitleEl) detTitleEl.textContent = 'Awaiting Telemetry';
      if (detCoordsEl) detCoordsEl.textContent = 'No field sensors currently reporting · Ready for hardware stream';
      if (metricGridEl) {
        metricGridEl.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 24px 18px; text-align: center; color: var(--ink-faint); font-family: var(--font-mono); font-size: 11px; border: 1px dashed var(--hairline); border-radius: 8px; background: var(--panel-raised);">
            📡 No active stations online. When field sensor readings arrive at Firestore (/sensors), station metrics will populate automatically.
          </div>`;
      }
      if (coreSampleEl) coreSampleEl.innerHTML = '<div class="skeleton-shimmer skeleton-box" style="border-radius:4px; opacity:0.35;"></div>';
      if (coreReadoutsEl) {
        coreReadoutsEl.innerHTML = `
          <div style="padding: 8px 0; color: var(--ink-faint); font-family: var(--font-mono); font-size: 11px;">
            Awaiting soil probe data...
          </div>`;
      }
      if (camTempEl) camTempEl.textContent = '—°C';
      if (camIdEl) camIdEl.textContent = 'STANDBY';
      if (alertCountEl) alertCountEl.textContent = '0 active alerts';
      return;
    }

    if (detTitleEl) detTitleEl.textContent = stationSpec.name;
    const latStr = stationSpec.lat != null ? `${stationSpec.lat.toFixed(4)}°` : '—';
    const lngStr = stationSpec.lng != null ? `${stationSpec.lng.toFixed(4)}°` : '—';
    if (detCoordsEl) {
      detCoordsEl.textContent = `${stationSpec.id} · ${latStr}, ${lngStr} · ${stationSpec.crop}`;
    }

    // 1. Metric Cards
    const cards = this._presenter.getMetricCardViewModels(activeStationId);
    if (metricGridEl) {
      if (cards.length > 0) {
        metricGridEl.innerHTML = cards.map((c) => `
          <div class="metric-card status-${c.status}">
            <div class="metric-label">
              <span>${c.name}</span>
              ${c.depthInfo ? `<span style="opacity:0.6">${c.depthInfo}</span>` : ''}
            </div>
            <div class="metric-value">${c.value}<span class="metric-unit"> ${c.unit}</span></div>
            <div class="metric-delta ${c.deltaDirectionClass}">${c.deltaFormatted}</div>
          </div>
        `).join('');
      } else {
        metricGridEl.innerHTML = `
          <div class="metric-card metric-card-skeleton" style="opacity: 0.65;">
            <div class="skeleton-shimmer skeleton-text" style="width: 50%; height: 9px;"></div>
            <div class="skeleton-shimmer skeleton-title" style="width: 65%; height: 20px; margin: 6px 0;"></div>
            <div class="skeleton-shimmer skeleton-text" style="width: 35%; height: 9px; margin-bottom: 0;"></div>
          </div>
          <div class="metric-card metric-card-skeleton" style="opacity: 0.65;">
            <div class="skeleton-shimmer skeleton-text" style="width: 55%; height: 9px;"></div>
            <div class="skeleton-shimmer skeleton-title" style="width: 70%; height: 20px; margin: 6px 0;"></div>
            <div class="skeleton-shimmer skeleton-text" style="width: 40%; height: 9px; margin-bottom: 0;"></div>
          </div>
          <div style="grid-column: 1 / -1; padding: 16px; text-align: center; color: var(--ink-faint); font-family: var(--font-mono); font-size: 11px; border: 1px dashed var(--hairline); border-radius: 8px; background: rgba(35,32,26,0.35);">
            🌱 Station registered · Awaiting hardware telemetry stream (/sensors)...
          </div>`;
      }
    }

    // 2. Soil Core Stratigraphy
    const cores = this._presenter.getSoilCoreViewModels(activeStationId);
    if (coreSampleEl && coreReadoutsEl) {
      if (cores.length > 0) {
        const h = 100 / cores.length;
        coreSampleEl.innerHTML = cores.map((b) => `
          <div class="core-band" data-pct="${Math.round(b.pct)}%" style="height:${h}%;background:${b.color};opacity:${b.opacity};"></div>
        `).join('');

        coreReadoutsEl.innerHTML = cores.map((b) => `
          <div class="core-readout-row">
            <span class="cr-name">${b.name}</span>
            <span class="cr-val">${b.valueFormatted}</span>
          </div>
        `).join('');
      } else {
        coreSampleEl.innerHTML = '<div class="skeleton-shimmer skeleton-box" style="border-radius:4px; opacity:0.35;"></div>';
        coreReadoutsEl.innerHTML = `
          <div class="core-readout-skeleton" style="opacity:0.65;">
            <div class="skeleton-shimmer skeleton-text" style="width: 45%; height: 10px; margin:0;"></div>
            <div class="skeleton-shimmer skeleton-text" style="width: 20%; height: 10px; margin:0;"></div>
          </div>
          <div class="core-readout-skeleton" style="opacity:0.65;">
            <div class="skeleton-shimmer skeleton-text" style="width: 50%; height: 10px; margin:0;"></div>
            <div class="skeleton-shimmer skeleton-text" style="width: 25%; height: 10px; margin:0;"></div>
          </div>
          <div style="padding: 6px 0 0 0; color: var(--ink-faint); font-family: var(--font-mono); font-size: 10px; text-align: right;">
            Awaiting root probe depth data...
          </div>`;
      }
    }

    // 3. Thermal Camera Temperature
    const tempSensors = this._telemetryService.registry.getSensorsByStation(activeStationId).filter((s) => s.metricDefinition.metricType === 'temp');
    if (camTempEl && camIdEl) {
      if (tempSensors.length > 0) {
        camTempEl.textContent = `${tempSensors[0].currentState.latestValue.toFixed(1)}°C`;
        camIdEl.textContent = 'CAM-' + (activeStationId.includes('-') ? activeStationId.split('-')[1] : activeStationId);
      } else {
        camTempEl.textContent = '—°C';
        camIdEl.textContent = 'STANDBY';
      }
    }

    // 4. Alert Counter
    if (alertCountEl) {
      const totalAlerts = this._presenter.getTotalActiveAlertCount();
      alertCountEl.textContent = `${totalAlerts} active alert${totalAlerts !== 1 ? 's' : ''}`;
    }
  }
}
