/**
 * Shamba Watch 2.0 — Station List View Controller
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 */

import { Icons } from './icons.js';

export class StationListView {
  /**
   * @param {Object} dependencies
   * @param {HTMLElement} dependencies.containerEl
   * @param {import('../services/station-service.js').StationService} dependencies.stationService
   * @param {import('./dashboard-presenter.js').DashboardPresenter} dependencies.presenter
   * @param {import('../services/map-service.js').MapService} dependencies.mapService
   */
  constructor({ containerEl, stationService, presenter, mapService }) {
    this._containerEl = containerEl;
    this._stationService = stationService;
    this._presenter = presenter;
    this._mapService = mapService;
  }

  /**
   * Renders the sidebar station list or honest empty state.
   */
  render() {
    if (!this._containerEl) return;

    const allStations = this._stationService.getActiveStations();
    const activeStationId = this._stationService.syncActiveSelection();

    // Synchronize GIS markers strictly for reporting stations
    this._mapService.syncMarkers(allStations);

    if (allStations.length === 0) {
      this._containerEl.innerHTML = `
        <div style="padding: 24px 18px; text-align: center; color: var(--ink-faint); font-family: var(--font-mono); font-size: 11px;">
          <div style="font-size: 24px; margin-bottom: 8px; color: var(--moss); display: inline-flex;">${Icons.radio({ size: 28 })}</div>
          <div style="color: var(--ink); font-weight: 600; font-family: var(--font-body); font-size: 13px; margin-bottom: 4px;">No Active Stations</div>
          <div style="line-height: 1.5; font-size: 10px; color: var(--ink-dim);">Awaiting field telemetry in Firestore (/sensors). Stations with reporting sensors will appear here automatically.</div>
        </div>
      `;
      return;
    }

    const viewModels = this._presenter.getStationListViewModels(allStations, activeStationId);

    this._containerEl.innerHTML = viewModels.map((vm) => `
      <div class="station-item ${vm.isActive ? 'active' : ''}" data-station-id="${vm.id}">
        <div>
          <div class="station-name">${vm.name}</div>
          <div class="station-sub">${vm.id} · ${vm.crop} · ${vm.sensorCount} sensor${vm.sensorCount === 1 ? '' : 's'}</div>
        </div>
        <div class="station-flag" style="background:${vm.color};"></div>
      </div>
    `).join('');

    // Attach click events
    this._containerEl.querySelectorAll('.station-item').forEach((item) => {
      item.addEventListener('click', () => {
        this._stationService.selectStation(item.dataset.stationId, true);
      });
    });

    // Update GIS marker accents
    viewModels.forEach((vm) => {
      this._mapService.updateMarkerColor(vm.id, vm.color);
    });
  }
}
