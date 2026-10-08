/**
 * Shamba Watch 2.0 — App Shell Orchestrator
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), 15 (Resource Management),
 * 36 (Dependency Injection / IoC), and 46 (Event-Driven Communication).
 */

import { APP_CONFIG } from '../config/app-config.js';
import { EventTypes } from '../contracts/event-types.js';
import { StructuredLogger } from '../core/structured-logger.js';
import { StationListView } from './station-list-view.js';
import { TelemetryDetailView } from './telemetry-detail-view.js';
import { TimeseriesChartView } from './timeseries-chart-view.js';
import { ThemeToggleView } from './theme-toggle-view.js';
import { MapView } from './map-view.js';
import { SearchBar } from './search-bar.js';
import { NotificationManager } from './notification-manager.js';
import { AiChatBar } from './ai-chat-bar.js';
import { ShambaAgent } from '../services/shamba-agent.js';

export class AppShell {
  /**
   * @param {Object} dependencies
   * @param {import('../core/service-registry.js').ServiceRegistry} dependencies.serviceRegistry
   * @param {import('../core/event-bus.js').EventBus} dependencies.eventBus
   */
  constructor({ serviceRegistry, eventBus }) {
    this._serviceRegistry = serviceRegistry;
    this._eventBus = eventBus;
    this._logger = new StructuredLogger('AppShell');

    this._clockTimer = null;
    this._subscriptions = [];
  }

  /**
   * Initializes all view controllers, binds event subscriptions, and starts telemetry pipeline.
   */
  async bootstrap() {
    this._logger.info('Bootstrapping Shamba Watch 2.0 SOA platform...');

    // Resolve domain services from ServiceRegistry (Rule 36, 49)
    const stationService = this._serviceRegistry.get('stationService');
    const telemetryService = this._serviceRegistry.get('telemetryService');
    const analyticsService = this._serviceRegistry.get('analyticsService');
    const mapService = this._serviceRegistry.get('mapService');
    const themeService = this._serviceRegistry.get('themeService');
    const presenter = this._serviceRegistry.get('presenter');

    // 1. Initialize Theme Service
    themeService.init();

    // 2. Initialize Geospatial Map
    mapService.init('map', (stationId) => {
      stationService.selectStation(stationId, true);
    });

    // 3. Initialize View Controllers
    this._stationListView = new StationListView({
      containerEl: document.getElementById('stationList'),
      stationService,
      presenter,
      mapService
    });

    this._telemetryDetailView = new TelemetryDetailView({
      stationService,
      telemetryService,
      presenter
    });

    this._timeseriesChartView = new TimeseriesChartView({
      stationService,
      analyticsService,
      telemetryService,
      presenter
    });

    this._themeToggleView = new ThemeToggleView({ themeService });
    this._mapView = new MapView({ mapService, stationService });

    // 4. Initialize Notification Manager
    this._notificationManager = new NotificationManager(
      document.getElementById('shambaNotificationContainer'),
      (stationId, sensorId) => {
        stationService.selectStation(stationId, true);
        if (sensorId) {
          const sensor = telemetryService.registry.getSensor(sensorId);
          if (sensor) {
            analyticsService.setMetricType(sensor.metricDefinition.metricType);
            this._timeseriesChartView.setActiveMetricButton(sensor.metricDefinition.metricType);
          }
        }
      }
    );

    // 5. Initialize Search Bar Component
    this._searchBar = new SearchBar({
      inputEl: document.getElementById('searchInput'),
      dropdownEl: document.getElementById('searchDropdown'),
      registry: telemetryService.registry,
      stations: () => stationService.getActiveStations(),
      onSelect: ({ stationId, metricType }) => {
        stationService.selectStation(stationId, true);
        if (metricType) {
          analyticsService.setMetricType(metricType);
          this._timeseriesChartView.setActiveMetricButton(metricType);
        }
      }
    });

    // 6. Initialize AI Field Agent & Chat Bar
    this._shambaAgent = new ShambaAgent({
      registry: telemetryService.registry,
      stations: () => stationService.getActiveStations(),
      presenter
    });

    this._aiChatBar = new AiChatBar({
      mountEl: document.getElementById('aiChatMount'),
      agent: this._shambaAgent,
      onSelectStation: (stationId) => {
        stationService.selectStation(stationId, true);
      }
    });

    // 7. Wire EventBus Subscriptions (Rule 46)
    this._wireEventSubscriptions();

    // 8. Start Live Clock
    this._startClock();

    // 9. Initial View Render
    this.renderAll();

    // 10. Connect Real-Time Telemetry Pipeline
    await telemetryService.connectPipeline();

    // Window resize chart re-render
    window.addEventListener('resize', () => {
      this._timeseriesChartView.render();
    });

    this._logger.info('Shamba Watch 2.0 SOA successfully initialized.');
  }

  /**
   * Binds EventBus listeners to coordinate UI updates with loose coupling.
   * @private
   */
  _wireEventSubscriptions() {
    const stationService = this._serviceRegistry.get('stationService');
    const mapService = this._serviceRegistry.get('mapService');

    // On Station Selected
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.STATION_SELECTED, (event) => {
        const { station } = event.payload;
        if (station && station.lat != null && station.lng != null) {
          mapService.panTo(station.lat, station.lng);
        }
        this._stationListView.render();
        this._telemetryDetailView.render();
        this._timeseriesChartView.render();

        if (window.innerWidth <= 768) {
          this._mapView.setMobileTab('detail');
        }
      })
    );

    // On Telemetry Ingested
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.TELEMETRY_INGESTED, () => {
        this.renderAll();
      })
    );

    // On Sensor Discovered
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.SENSOR_DISCOVERED, (event) => {
        const { sensor } = event.payload;
        const allStations = stationService.getActiveStations();
        const station = allStations.find((s) => s.id === sensor.stationId);
        this._notificationManager.notifyNewSensor(sensor, station ? station.name : sensor.stationId);
        this.renderAll();
      })
    );

    // On Stream Status Changed (Header Live Dot)
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.STREAM_STATUS_CHANGED, (event) => {
        const { isLive, label } = event.payload;
        const statusDot = document.getElementById('telemetryStatusDot');
        const statusLabel = document.getElementById('telemetryStatusLabel');
        if (statusDot) {
          statusDot.classList.toggle('live', Boolean(isLive));
        }
        if (statusLabel) {
          statusLabel.textContent = label || (isLive ? 'Production Telemetry · Firestore Live' : 'Production Telemetry · Local Cache');
        }
      })
    );

    // On Window or Metric Changed
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.WINDOW_CHANGED, () => {
        this._timeseriesChartView.render();
      })
    );

    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.METRIC_CHANGED, () => {
        this._timeseriesChartView.render();
      })
    );

    // On Theme Changed
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.THEME_CHANGED, (event) => {
        this._themeToggleView.updateUI(event.payload.theme);
        this._timeseriesChartView.render();
      })
    );
  }

  /**
   * Renders all views across the platform.
   */
  renderAll() {
    this._stationListView.render();
    this._telemetryDetailView.render();
    this._timeseriesChartView.render();
  }

  /**
   * Runs the East Africa Time (EAT) real-time clock.
   * @private
   */
  _startClock() {
    const update = () => {
      const clockEl = document.getElementById('clock');
      if (clockEl) {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString(APP_CONFIG.DEFAULT_LOCALE, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: APP_CONFIG.TIMEZONE
        }) + ' EAT';
      }
    };
    this._clockTimer = setInterval(update, 1000);
    update();
  }

  /**
   * Disposes all subscriptions and timers (Rule 15).
   */
  dispose() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
    this._subscriptions.forEach((unsub) => {
      if (typeof unsub === 'function') unsub();
    });
    this._subscriptions = [];
  }
}
