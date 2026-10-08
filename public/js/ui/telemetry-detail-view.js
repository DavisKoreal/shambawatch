/**
 * Shamba Watch 2.0 — Telemetry Detail View Controller
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 */

export class TelemetryDetailView {
  /**
   * @param {Object} dependencies
   * @param {import('../services/station-service.js').StationService} dependencies.stationService
   * @param {import('../services/telemetry-service.js').TelemetryService} dependencies.telemetryService
   * @param {import('../services/analytics-service.js').AnalyticsService} [dependencies.analyticsService]
   * @param {import('./dashboard-presenter.js').DashboardPresenter} dependencies.presenter
   * @param {(sensorId: string) => void} [dependencies.onSelectSensor]
   * @param {(sensorId: string) => void} [dependencies.onOpenSensorModal]
   * @param {(sensor: Object) => void} [dependencies.onAskAi]
   */
  constructor({ stationService, telemetryService, analyticsService = null, presenter, onSelectSensor = null, onOpenSensorModal = null, onAskAi = null }) {
    this._stationService = stationService;
    this._telemetryService = telemetryService;
    this._analyticsService = analyticsService;
    this._presenter = presenter;
    this._onSelectSensor = onSelectSensor;
    this._onOpenSensorModal = onOpenSensorModal;
    this._onAskAi = onAskAi;
  }

  /**
   * Renders the telemetry detail pane.
   */
  render() {
    const allStations = this._stationService.getActiveStations();
    const activeStationId = this._stationService.getActiveStationId() || (allStations[0]?.id ?? null);
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

    // 1. Station Sensors Grid (Interactive Sensor Cards)
    const activeSensorId = this._analyticsService?.activeSensorId;
    const cards = this._presenter.getStationSensorsViewModel(activeStationId, activeSensorId);
    if (metricGridEl) {
      if (cards.length > 0) {
        metricGridEl.innerHTML = cards.map((c) => {
          const isSelected = c.id === activeSensorId;
          return `
            <div class="metric-card status-${c.status} ${isSelected ? 'metric-card-selected' : ''}" data-sensor-id="${c.id}" role="button" tabindex="0" title="Click to graph sensor timeseries">
              <div class="metric-label">
                <span class="sensor-title">${c.name}</span>
                ${c.depthInfo ? `<span class="sensor-depth-tag">${c.depthInfo}</span>` : ''}
              </div>
              <div class="metric-hw-row">
                <span class="sensor-hw-id">#${c.hardwareId}</span>
                ${c.batteryPct != null ? `<span class="sensor-battery-pill">🔋 ${c.batteryPct}%</span>` : ''}
              </div>
              <div class="metric-value">${c.value}<span class="metric-unit"> ${c.unit}</span></div>
              <div class="metric-card-footer">
                <div class="metric-delta ${c.deltaDirectionClass}">${c.deltaFormatted} vs prev</div>
                <div class="sensor-card-actions">
                  <button type="button" class="btn-sensor-inspect" data-sensor-id="${c.id}" title="Deep-Dive Timeseries & Custom Time Range">📈 Graph</button>
                  <button type="button" class="btn-sensor-ask-ai" data-sensor-id="${c.id}" title="Ask AI Agronomist about this sensor">✦ AI</button>
                </div>
              </div>
            </div>
          `;
        }).join('');

        // Attach click listeners to cards and action buttons
        metricGridEl.querySelectorAll('.metric-card').forEach((cardEl) => {
          const sensorId = cardEl.dataset.sensorId;
          cardEl.addEventListener('click', (e) => {
            // Ignore if clicked on an action button directly
            if (e.target.closest('button')) return;
            if (this._analyticsService) {
              this._analyticsService.setActiveSensorId(sensorId);
            }
            if (this._onSelectSensor) {
              this._onSelectSensor(sensorId);
            }
          });
        });

        metricGridEl.querySelectorAll('.btn-sensor-inspect').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sensorId = btn.dataset.sensorId;
            if (this._onOpenSensorModal) {
              this._onOpenSensorModal(sensorId);
            }
          });
        });

        metricGridEl.querySelectorAll('.btn-sensor-ask-ai').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sensorId = btn.dataset.sensorId;
            const sensor = this._telemetryService.registry.getSensor(sensorId);
            if (this._onAskAi && sensor) {
              this._onAskAi(sensor);
            }
          });
        });

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
