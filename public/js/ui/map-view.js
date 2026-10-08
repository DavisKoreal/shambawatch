/**
 * Shamba Watch 2.0 — Map View & Mobile Navigation Controller
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 */

export class MapView {
  /**
   * @param {Object} dependencies
   * @param {import('../services/map-service.js').MapService} dependencies.mapService
   * @param {import('../services/station-service.js').StationService} dependencies.stationService
   */
  constructor({ mapService, stationService }) {
    this._mapService = mapService;
    this._stationService = stationService;

    this._bindLayerControls();
    this._bindMobileTabs();
    this._bindResizeListeners();
  }

  _bindLayerControls() {
    document.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this._mapService.switchLayer(btn.dataset.layer);
      });
    });
  }

  _bindMobileTabs() {
    document.querySelectorAll('.mobile-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setMobileTab(btn.dataset.tab);
      });
    });
  }

  /**
   * Switches mobile tab view ('map', 'stations', 'detail').
   * @param {'map'|'stations'|'detail'} tab
   */
  setMobileTab(tab) {
    const layout = document.getElementById('mainLayout');
    const tabBtns = document.querySelectorAll('.mobile-tab-btn');
    if (!layout) return;

    layout.classList.remove('show-map', 'show-stations', 'show-detail');
    layout.classList.add(`show-${tab}`);
    tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));

    if (tab === 'map') {
      setTimeout(() => this._mapService.invalidateSize(), 150);
    }
  }

  _bindResizeListeners() {
    window.addEventListener('resize', () => {
      this._mapService.invalidateSize();
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this._mapService.invalidateSize();
      }, 200);
    });
  }
}
