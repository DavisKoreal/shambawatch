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
import { NotificationManager } from './notification-manager.js';
import { AiChatBar } from './ai-chat-bar.js';
import { ShambaAgent } from '../services/shamba-agent.js';
import { AuthModal } from './auth-modal.js';
import { AdminPortalView } from './admin-portal-view.js';
import { SensorDetailModal } from './sensor-detail-modal.js';
import { MarketingPageView } from './marketing-page-view.js';
import { UserRole } from '../services/auth-service.js';

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
    this._authModal = null;
    this._adminPortal = null;
    this._sensorDetailModal = null;
    this._marketingPageView = null;
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
    const authService = this._serviceRegistry.get('authService');

    // 1. Initialize Theme Service
    themeService.init();

    // 2. Initialize Geospatial Map
    mapService.init('map', (stationId) => {
      stationService.selectStation(stationId, true);
    });

    // 3. Initialize Marketing Page & Modals
    const marketingMount = document.getElementById('marketingPageMount');
    if (marketingMount) {
      this._marketingPageView = new MarketingPageView({
        mountEl: marketingMount,
        authService,
        eventBus: this._eventBus,
        onLaunchPlatform: () => {
          if (authService?.isAuthenticated) {
            this._handleAuthStateChange({
              isAuthenticated: true,
              user: authService.getCurrentUser(),
              profile: authService.getCurrentProfile(),
              role: authService.role
            });
          } else {
            this._authModal.open('signup');
          }
        },
        onOpenSignIn: () => {
          this._authModal.open('signin');
        }
      });
    }

    this._authModal = new AuthModal({
      authService,
      stationService,
      mountEl: document.getElementById('authModalMount')
    });

    this._adminPortal = new AdminPortalView({
      authService,
      stationService,
      mountEl: document.getElementById('adminPortalMount'),
      onAssignmentChanged: () => {
        this.renderAll();
      }
    });

    this._sensorDetailModal = new SensorDetailModal({
      registry: telemetryService.registry,
      analyticsService,
      telemetryService,
      presenter,
      mountEl: document.getElementById('sensorModalMount'),
      onOpenAiWithPrompt: (prompt) => {
        this._aiChatBar.ask(prompt);
      }
    });

    // 4. Initialize View Controllers
    this._stationListView = new StationListView({
      containerEl: document.getElementById('stationList'),
      stationService,
      presenter,
      mapService
    });

    this._telemetryDetailView = new TelemetryDetailView({
      stationService,
      telemetryService,
      analyticsService,
      presenter,
      onSelectSensor: (sensorId) => {
        telemetryService.fetchSensorHistory(sensorId, 100);
        this._timeseriesChartView.render();
      },
      onOpenSensorModal: (sensorId, windowMs) => {
        this._sensorDetailModal.open(sensorId, windowMs);
      },
      onAskAi: (sensor) => {
        const crop = sensor.metadata.crop || 'crop';
        const prompt = `Explain the reading of ${sensor.currentState.latestValue}${sensor.metricDefinition.unitSymbol} on my ${sensor.metadata.name} (${sensor.id}) for ${crop}. What actions or irrigation should I take?`;
        this._aiChatBar.ask(prompt);
      }
    });

    this._timeseriesChartView = new TimeseriesChartView({
      stationService,
      analyticsService,
      telemetryService,
      presenter,
      onOpenSensorModal: (sensorId, windowMs) => {
        this._sensorDetailModal.open(sensorId, windowMs);
      }
    });

    this._themeToggleView = new ThemeToggleView({ themeService });
    this._mapView = new MapView({ mapService, stationService });

    // 5. Initialize Notification Manager
    this._notificationManager = new NotificationManager(
      document.getElementById('shambaNotificationContainer'),
      (stationId, sensorId) => {
        stationService.selectStation(stationId, true);
        if (sensorId) {
          const sensor = telemetryService.registry.getSensor(sensorId);
          if (sensor) {
            analyticsService.setActiveSensorId(sensor.id);
            this._timeseriesChartView.setActiveMetricButton(sensor.metricDefinition.metricType);
          }
        }
      }
    );

    // 6. Initialize AI Field Agent & Unified AI Search Bar
    this._shambaAgent = new ShambaAgent({
      registry: telemetryService.registry,
      stations: () => stationService.getActiveStations(),
      presenter
    });

    this._aiChatBar = new AiChatBar({
      mountEl: document.getElementById('aiChatMount'),
      agent: this._shambaAgent,
      onSelectStation: (stationId, metricType) => {
        stationService.selectStation(stationId, true);
        if (metricType) {
          analyticsService.setMetricType(metricType);
          this._timeseriesChartView.setActiveMetricButton(metricType);
        }
      }
    });

    // 7. Connect Header Controls
    const headerAiLauncher = document.getElementById('headerAiLauncher');
    if (headerAiLauncher) {
      headerAiLauncher.addEventListener('click', () => {
        this._aiChatBar.openAndFocus();
      });
    }

    const adminPortalBtn = document.getElementById('adminPortalBtn');
    if (adminPortalBtn) {
      adminPortalBtn.addEventListener('click', () => {
        this._adminPortal.open();
      });
    }

    this._globalKeyHandler = (e) => {
      if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) &&
          document.activeElement.tagName !== 'INPUT' &&
          document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this._aiChatBar.openAndFocus();
      }
    };
    document.addEventListener('keydown', this._globalKeyHandler);

    // 8. Wire EventBus Subscriptions (Rule 46)
    this._wireEventSubscriptions();

    // 9. Initialize Authentication & Gatekeeper Access Control
    if (authService) {
      await authService.init();
      const isAuth = authService.isAuthenticated;
      await this._handleAuthStateChange({
        isAuthenticated: isAuth,
        user: authService.getCurrentUser(),
        profile: authService.getCurrentProfile(),
        role: authService.role
      });
    } else {
      await this._handleAuthStateChange({ isAuthenticated: false, user: null, role: null });
    }

    // 10. Start Live Clock
    this._startClock();

    // 11. Initial View Render (if authenticated)
    if (authService?.isAuthenticated) {
      this.renderAll();

      // 12. Connect Real-Time Telemetry Pipeline
      await telemetryService.connectPipeline();

      // 13. Proactively load recorded history from Firestore for initial active station
      const activeStations = stationService.getActiveStations();
      if (activeStations.length > 0) {
        telemetryService.fetchStationSensorsHistory(activeStations[0].id).then(() => {
          this._timeseriesChartView.render();
        });
      }
    }

    // Window resize chart re-render
    window.addEventListener('resize', () => {
      if (authService?.isAuthenticated) {
        this._timeseriesChartView.render();
      }
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
    const telemetryService = this._serviceRegistry.get('telemetryService');

    // On Station Selected
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.STATION_SELECTED, (event) => {
        const payload = event?.payload || event || {};
        const station = payload.station;
        const stationId = payload.stationId || station?.id;

        if (station && station.lat != null && station.lng != null) {
          mapService.panTo(station.lat, station.lng);
        }
        if (stationId) {
          telemetryService.subscribeStationMast(stationId);
          telemetryService.fetchStationSensorsHistory(stationId).then(() => {
            this._timeseriesChartView.render();
          });
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
        const payload = event?.payload || event || {};
        const sensor = payload.sensor;
        if (sensor) {
          const allStations = stationService.getActiveStations();
          const station = allStations.find((s) => s.id === sensor.stationId);
          this._notificationManager.notifyNewSensor(sensor, station ? station.name : sensor.stationId);
          this.renderAll();
        }
      })
    );

    // On Stream Status Changed (Header Live Dot)
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.STREAM_STATUS_CHANGED, (event) => {
        const payload = event?.payload || event || {};
        const isLive = payload.isLive;
        const label = payload.label;
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
        const payload = event?.payload || event || {};
        this._themeToggleView.updateUI(payload.theme);
        this._timeseriesChartView.render();
      })
    );

    // On Auth State Changed (Rule 46)
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.AUTH_STATE_CHANGED, async (event) => {
        const payload = event?.payload || event || {};
        this._updateHeaderAuthUI(payload);
        await this._handleAuthStateChange(payload);
      })
    );

    // On Farmer Assigned
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.FARMER_ASSIGNED, () => {
        this.renderAll();
      })
    );

    // On Sensor Selected
    this._subscriptions.push(
      this._eventBus.subscribe(EventTypes.SENSOR_SELECTED, () => {
        this._telemetryDetailView.render();
        this._timeseriesChartView.render();
      })
    );
  }

  /**
   * Updates Header Authentication UI widget and role-based buttons.
   * @private
   */
  _updateHeaderAuthUI(authPayload) {
    const authSlot = document.getElementById('headerAuthSlot');
    const adminPortalBtn = document.getElementById('adminPortalBtn');
    const authService = this._serviceRegistry.get('authService');
    const stationService = this._serviceRegistry.get('stationService');

    if (!authSlot) return;

    if (!authPayload.isAuthenticated || !authPayload.user) {
      // Guest observer state
      authSlot.innerHTML = `
        <button class="header-auth-btn signin-btn" id="headerSignInBtn" type="button" title="Sign In or Register with Email/Password">
          <span class="auth-btn-icon">🔐</span>
          <span>Sign In</span>
        </button>
      `;
      const signInBtn = authSlot.querySelector('#headerSignInBtn');
      signInBtn?.addEventListener('click', () => {
        this._authModal.open('signin');
      });

      if (adminPortalBtn) adminPortalBtn.style.display = 'none';
      return;
    }

    const { user, profile, role, isAdmin, isFarmer, assignedStationId } = authPayload;
    const displayName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'User';

    if (adminPortalBtn) {
      adminPortalBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    authSlot.innerHTML = `
      <div class="user-profile-badge">
        <span class="user-role-tag role-${role}">${role.toUpperCase()}</span>
        <span class="user-display-name" title="${user.email}">${displayName}</span>
        ${isFarmer && assignedStationId ? `
          <span class="farmer-station-chip" title="Subscribed Station: ${assignedStationId}">🌾 ${assignedStationId}</span>
        ` : ''}
        <button class="header-signout-btn" id="headerSignOutBtn" type="button" title="Sign Out">Sign Out</button>
      </div>
    `;

    const signOutBtn = authSlot.querySelector('#headerSignOutBtn');
    signOutBtn?.addEventListener('click', async () => {
      await authService.signOut();
    });

    // If farmer is subscribed to a station, auto-focus their station
    if (isFarmer && assignedStationId) {
      stationService.selectStation(assignedStationId, true);
    }
  }

  /**
   * Enforces Gatekeeper access control.
   * If not logged in, visitor can only access the marketing page.
   * @private
   * @param {Object} authPayload
   */
  async _handleAuthStateChange(authPayload) {
    const appEl = document.getElementById('app');
    const telemetryService = this._serviceRegistry.get('telemetryService');
    const stationService = this._serviceRegistry.get('stationService');

    const isAuth = Boolean(authPayload?.isAuthenticated && authPayload?.user);

    if (!isAuth) {
      // 1. Unauthenticated: Show Marketing Page only, hide dashboard platform
      if (this._marketingPageView) {
        this._marketingPageView.show();
      }
      if (appEl) {
        appEl.style.display = 'none';
      }
      // Stop telemetry polling to save quota and enforce access control
      if (telemetryService) {
        telemetryService.stopPolling();
      }
      this._logger.info('Access control enforced: Visitor unauthenticated. Displaying marketing page.');
    } else {
      // 2. Authenticated: Hide Marketing Page, unlock platform
      if (this._marketingPageView) {
        this._marketingPageView.hide();
      }
      if (appEl) {
        appEl.style.display = 'flex';
      }
      this.renderAll();

      // Connect pipeline & start polling if authenticated
      if (telemetryService) {
        await telemetryService.connectPipeline();
        const activeStations = stationService.getActiveStations();
        if (activeStations.length > 0) {
          telemetryService.fetchStationSensorsHistory(activeStations[0].id).then(() => {
            this._timeseriesChartView.render();
          });
        }
      }
      this._logger.info(`Access granted to platform for authenticated user: ${authPayload.user.email} (${authPayload.role})`);
    }
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
    if (this._globalKeyHandler) {
      document.removeEventListener('keydown', this._globalKeyHandler);
      this._globalKeyHandler = null;
    }
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
