/**
 * Shamba Watch 2.0 — Map Service (Geospatial GIS Bounded Context)
 * Adheres to Rules 1 (SRP), 15 (Resource Management), 39 (Independent Framework),
 * and 54 (Bounded Context).
 */

import { StructuredLogger } from '../core/structured-logger.js';
import { EventTypes } from '../contracts/event-types.js';

export class MapService {
  /**
   * @param {Object} dependencies
   * @param {import('../core/event-bus.js').EventBus} dependencies.eventBus
   */
  constructor({ eventBus }) {
    if (!eventBus) throw new TypeError('MapService requires an injected EventBus.');
    this._eventBus = eventBus;
    this._logger = new StructuredLogger('MapService');

    this._map = null;
    this._terrainLayer = null;
    this._satLayer = null;
    this._activeLayer = 'terrain';
    /** @type {Object<string, Object>} */
    this._markers = {};
  }

  get map() {
    return this._map;
  }

  get activeLayer() {
    return this._activeLayer;
  }

  /**
   * Initializes the Leaflet map on the specified DOM container.
   * @param {string|HTMLElement} container
   * @param {(stationId: string) => void} [onMarkerClick]
   */
  init(container, onMarkerClick = null) {
    if (typeof L === 'undefined') {
      this._logger.warn('Leaflet library is not available in global scope.');
      return;
    }

    const mapEl = typeof container === 'string' ? document.getElementById(container) : container;
    if (!mapEl) return;

    this._map = L.map(mapEl, { zoomControl: false, attributionControl: false }).setView([-0.42, 36.15], 10.5);
    L.control.zoom({ position: 'bottomright' }).addTo(this._map);

    this._terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 });
    this._satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 });

    this._terrainLayer.addTo(this._map);
    this._onMarkerClick = onMarkerClick;
    this._logger.info('Leaflet GIS map initialized.');
  }

  /**
   * Synchronizes map markers strictly for stations with active reporting sensors.
   * Phantom markers with 0 sensors are completely purged.
   * @param {Array<Object>} stations
   */
  syncMarkers(stations = []) {
    if (!this._map || typeof L === 'undefined') return;

    const currentIds = new Set(stations.map((s) => s.id));

    // Remove markers for stations that are no longer active
    Object.keys(this._markers).forEach((stId) => {
      if (!currentIds.has(stId)) {
        if (this._markers[stId]) this._map.removeLayer(this._markers[stId]);
        delete this._markers[stId];
      }
    });

    // Place markers strictly for stations with active sensors
    stations.forEach((s) => {
      if (s.lat != null && s.lng != null && !this._markers[s.id]) {
        const icon = L.divIcon({
          className: '',
          html: `<div id="marker-${s.id}" style="width:14px;height:14px;border-radius:50%;background:#7A9471;border:2px solid var(--panel);box-shadow:0 0 0 3px rgba(122,148,113,0.35);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        const marker = L.marker([s.lat, s.lng], { icon }).addTo(this._map);
        if (typeof this._onMarkerClick === 'function') {
          marker.on('click', () => this._onMarkerClick(s.id));
        }
        this._markers[s.id] = marker;
      }
    });
  }

  /**
   * Updates marker color by station ID.
   * @param {string} stationId
   * @param {string} color
   */
  updateMarkerColor(stationId, color) {
    const el = document.getElementById(`marker-${stationId}`);
    if (el) {
      el.style.background = color;
      el.style.boxShadow = `0 0 0 3px ${color}55`;
    }
  }

  /**
   * Switches the active map layer ('terrain', 'satellite', 'infrared').
   * @param {'terrain'|'satellite'|'infrared'} layerName
   */
  switchLayer(layerName) {
    if (!this._map) return;
    this._activeLayer = layerName;
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.classList.remove('ir-mode');

    this._map.removeLayer(this._terrainLayer);
    this._map.removeLayer(this._satLayer);

    if (layerName === 'terrain') {
      this._terrainLayer.addTo(this._map);
    } else if (layerName === 'satellite') {
      this._satLayer.addTo(this._map);
    } else {
      this._satLayer.addTo(this._map);
      if (mapEl) mapEl.classList.add('ir-mode');
    }

    this._eventBus.publish(EventTypes.LAYER_CHANGED, { layerName }, { sourceService: 'MapService' });
  }

  /**
   * Centers the viewport on a station's coordinates.
   * @param {number} lat
   * @param {number} lng
   */
  panTo(lat, lng) {
    if (this._map && lat != null && lng != null) {
      this._map.panTo([lat, lng]);
    }
  }

  /**
   * Recalculates map container geometry upon resize.
   */
  invalidateSize() {
    if (this._map) {
      this._map.invalidateSize();
    }
  }

  /**
   * Resource disposal (Rule 15).
   */
  dispose() {
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
    this._markers = {};
  }
}
