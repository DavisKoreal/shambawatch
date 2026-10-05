/**
 * @fileoverview SearchBar Component for Shamba Watch.
 * Provides instant autocomplete search across stations, individual logical sensors,
 * crops, and metrics with full keyboard accessibility and theme matching.
 * Adheres to SWE Principle 1 (SRP) and Principle 2 (Separation of Concerns).
 */

export class SearchBar {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.inputEl - The input element.
   * @param {HTMLElement} options.dropdownEl - The dropdown container for results.
   * @param {import('../services/sensor-registry.js').SensorRegistry} options.registry
   * @param {Array<Object>} options.stations - The canonical stations list.
   * @param {(selection: { stationId: string, sensorId?: string, metricType?: string }) => void} options.onSelect
   */
  constructor({ inputEl, dropdownEl, registry, stations, onSelect }) {
    this._input = inputEl;
    this._dropdown = dropdownEl;
    this._registry = registry;
    this._stations = stations;
    this._onSelect = onSelect;
    this._selectedIndex = -1;
    this._currentResults = [];

    this._bindEvents();
  }

  _bindEvents() {
    this._input.addEventListener('input', (e) => this._handleInput(e.target.value));
    this._input.addEventListener('keydown', (e) => this._handleKeyDown(e));
    this._input.addEventListener('focus', () => {
      if (this._input.value.trim().length > 0) {
        this._showDropdown();
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!this._input.contains(e.target) && !this._dropdown.contains(e.target)) {
        this._hideDropdown();
      }
    });

    // Global shortcut: '/' or 'Ctrl+K' / 'Cmd+K' to focus search
    document.addEventListener('keydown', (e) => {
      if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && 
          document.activeElement.tagName !== 'INPUT' && 
          document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this._input.focus();
        this._input.select();
      }
    });
  }

  _handleInput(rawQuery) {
    const query = rawQuery.trim().toLowerCase();
    if (!query) {
      this._hideDropdown();
      this._currentResults = [];
      return;
    }

    this._currentResults = this._search(query);
    this._selectedIndex = -1;
    this._renderDropdown();
    this._showDropdown();
  }

  _search(query) {
    const results = [];

    // 1. Search Stations
    this._stations.forEach((s) => {
      const matchName = s.name.toLowerCase().includes(query);
      const matchId = s.id.toLowerCase().includes(query);
      const matchCrop = s.crop.toLowerCase().includes(query);

      if (matchName || matchId || matchCrop) {
        results.push({
          type: 'STATION',
          id: s.id,
          title: s.name,
          subtitle: `${s.id} · ${s.crop}`,
          stationId: s.id,
          badge: 'STATION',
          badgeClass: 'badge-station',
        });
      }
    });

    // 2. Search Registered Sensors
    const allSensors = this._registry.getAllSensors();
    allSensors.forEach((sensor) => {
      const matchName = sensor.metadata.name.toLowerCase().includes(query);
      const matchMetric = sensor.metricDefinition.name.toLowerCase().includes(query) ||
                          sensor.metricDefinition.metricType.toLowerCase().includes(query);
      const matchHardware = sensor.metadata.hardwareId?.toLowerCase().includes(query);
      const matchCrop = sensor.metadata.getAttribute('crop', '').toLowerCase().includes(query);

      if (matchName || matchMetric || matchHardware || matchCrop) {
        const val = sensor.currentState?.latestValue != null
          ? `${sensor.currentState.latestValue}${sensor.metricDefinition.unitSymbol}`
          : '';
        const station = this._stations.find(s => s.id === sensor.stationId);

        results.push({
          type: 'SENSOR',
          id: sensor.id,
          title: sensor.metadata.name,
          subtitle: `${station ? station.name : sensor.stationId} · ${val} · ${sensor.currentState?.status || 'nominal'}`,
          stationId: sensor.stationId,
          sensorId: sensor.id,
          metricType: sensor.metricDefinition.metricType,
          badge: sensor.metricDefinition.metricType.toUpperCase(),
          badgeClass: 'badge-sensor',
        });
      }
    });

    // Limit to top 8 most relevant results
    return results.slice(0, 8);
  }

  _renderDropdown() {
    if (this._currentResults.length === 0) {
      this._dropdown.innerHTML = `
        <div class="search-empty">No stations or sensors found matching query.</div>
      `;
      return;
    }

    this._dropdown.innerHTML = this._currentResults.map((item, idx) => `
      <div class="search-item ${idx === this._selectedIndex ? 'selected' : ''}" data-index="${idx}">
        <div class="search-item-left">
          <span class="search-badge ${item.badgeClass}">${item.badge}</span>
          <div>
            <div class="search-item-title">${this._highlight(item.title, this._input.value)}</div>
            <div class="search-item-sub">${item.subtitle}</div>
          </div>
        </div>
        <span class="search-arrow">↵</span>
      </div>
    `).join('');

    this._dropdown.querySelectorAll('.search-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.index);
        this._selectItem(idx);
      });
      el.addEventListener('mouseenter', () => {
        this._selectedIndex = Number(el.dataset.index);
        this._updateSelectionHighlight();
      });
    });
  }

  _highlight(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  _handleKeyDown(e) {
    if (this._currentResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._selectedIndex = (this._selectedIndex + 1) % this._currentResults.length;
      this._updateSelectionHighlight();
      this._scrollSelectedIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._selectedIndex = (this._selectedIndex - 1 + this._currentResults.length) % this._currentResults.length;
      this._updateSelectionHighlight();
      this._scrollSelectedIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this._selectedIndex >= 0 && this._selectedIndex < this._currentResults.length) {
        this._selectItem(this._selectedIndex);
      } else if (this._currentResults.length > 0) {
        this._selectItem(0);
      }
    } else if (e.key === 'Escape') {
      this._hideDropdown();
    }
  }

  _updateSelectionHighlight() {
    const items = this._dropdown.querySelectorAll('.search-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === this._selectedIndex);
    });
  }

  _scrollSelectedIntoView() {
    const selectedEl = this._dropdown.querySelector(`.search-item[data-index="${this._selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  _selectItem(index) {
    const item = this._currentResults[index];
    if (!item) return;

    this._hideDropdown();
    this._input.value = '';
    this._input.blur();

    if (this._onSelect) {
      this._onSelect({
        stationId: item.stationId,
        sensorId: item.sensorId,
        metricType: item.metricType,
      });
    }
  }

  _showDropdown() {
    this._dropdown.classList.add('visible');
  }

  _hideDropdown() {
    this._dropdown.classList.remove('visible');
  }
}
