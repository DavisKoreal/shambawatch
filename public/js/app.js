/**
 * Shamba Watch 2.0 — Application Bootstrap Entry Point
 * Service-Oriented & Microservices Architecture (SOA)
 * Adheres to Rules 1–61 (SRP, SoC, DRY, IoC, Event-Driven, Clean Architecture).
 */

import { InMemorySensorRepository } from './infrastructure/in-memory-sensor-repository.js';
import { SensorRegistry } from './services/sensor-registry.js';
import { DashboardPresenter } from './ui/dashboard-presenter.js';

// Core SOA Infrastructure
import { EventBus } from './core/event-bus.js';
import { ServiceRegistry } from './core/service-registry.js';
import { StructuredLogger } from './core/structured-logger.js';

// Bounded Context Services
import { StationService, STATION_METADATA_CATALOG } from './services/station-service.js';
import { TelemetryService } from './services/telemetry-service.js';
import { AnalyticsService } from './services/analytics-service.js';
import { MapService } from './services/map-service.js';
import { ThemeService } from './services/theme-service.js';
import { AlertService } from './services/alert-service.js';
import { GatewayClient } from './services/gateway-client.js';
import { AuthService } from './services/auth-service.js';

// UI Orchestration
import { AppShell } from './ui/app-shell.js';

const logger = new StructuredLogger('Bootstrap');

/**
 * Main application initialization sequence.
 */
export async function bootstrap() {
  try {
    logger.info('Initializing Shamba Watch 2.0 SOA container...');

    // 1. Core Event & Service Containers (Rules 36, 46, 49)
    const eventBus = new EventBus();
    const serviceRegistry = new ServiceRegistry();

    // 2. Domain Sensor Aggregates & Presenter
    const initialRepo = new InMemorySensorRepository();
    const registry = new SensorRegistry(initialRepo);
    const presenter = new DashboardPresenter(registry);

    // 3. Instantiate Bounded Context Services (Rules 1, 2, 54)
    const stationService = new StationService({ registry, eventBus, catalog: STATION_METADATA_CATALOG });
    const telemetryService = new TelemetryService({ registry, eventBus });
    const analyticsService = new AnalyticsService({ registry, eventBus });
    const mapService = new MapService({ eventBus });
    const themeService = new ThemeService({ eventBus });
    const alertService = new AlertService({ registry, eventBus });
    const gatewayClient = new GatewayClient();
    const authService = new AuthService({ eventBus });

    // 4. Register Services into ServiceRegistry for IoC Discovery (Rules 36, 49)
    serviceRegistry
      .register('eventBus', eventBus)
      .register('registry', registry)
      .register('presenter', presenter)
      .register('stationService', stationService)
      .register('telemetryService', telemetryService)
      .register('analyticsService', analyticsService)
      .register('mapService', mapService)
      .register('themeService', themeService)
      .register('alertService', alertService)
      .register('gatewayClient', gatewayClient)
      .register('authService', authService);

    // 5. Instantiate and Launch App Shell (Rule 6: Low Cyclomatic Complexity)
    const appShell = new AppShell({ serviceRegistry, eventBus });
    serviceRegistry.register('appShell', appShell);

    await appShell.bootstrap();
    logger.info('Platform successfully running in SOA mode.');
    return { serviceRegistry, eventBus, appShell };
  } catch (err) {
    logger.error('Fatal initialization error during platform bootstrap:', err);
    throw err;
  }
}

// Auto-start in browser environment
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrap());
  } else {
    bootstrap();
  }
}
