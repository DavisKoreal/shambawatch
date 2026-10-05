/**
 * @fileoverview Application Configuration and System Constants.
 * Centralized, externalized, and immutable configuration settings for the Shamba Watch platform.
 * Adheres to SWE Principle 26 (Externalized Configuration), Principle 41 (Global Variables at Top),
 * and Principle 11 (Avoidance of Magic Numbers).
 */

// ============================================================================
// GLOBAL CONFIGURATION DEFINITION (Positioned at Top per Principle 41)
// ============================================================================

export const APP_CONFIG = Object.freeze({
  // System Metadata
  SYSTEM_NAME: 'Shamba Watch',
  SYSTEM_VERSION: '2.0.0',
  DEFAULT_LOCALE: 'en-KE',
  TIMEZONE: 'Africa/Nairobi',

  // Telemetry & Timeseries Windowing Defaults (in milliseconds)
  TIME_WINDOWS: Object.freeze({
    TWENTY_FOUR_HOURS: 24 * 60 * 60 * 1000,   // 86,400,000 ms
    SEVEN_DAYS: 7 * 24 * 60 * 60 * 1000,       // 604,800,000 ms
    THIRTY_DAYS: 30 * 24 * 60 * 60 * 1000,     // 2,592,000,000 ms
  }),
  DEFAULT_WINDOW_KEY: '24h',
  DEFAULT_SAMPLE_INTERVAL_MS: 4000,           // 4 seconds simulation cycle
  MAX_BUFFER_POINTS: 500,                     // Safety ceiling per local sensor instance

  // Sensor Health & Quality Statuses
  HEALTH_STATUS: Object.freeze({
    NOMINAL: 'nominal',
    WATCH: 'watch',
    ALERT: 'alert',
    OFFLINE: 'offline',
    CALIBRATING: 'calibrating',
  }),

  QUALITY_CODES: Object.freeze({
    GOOD: 'GOOD',
    SUSPECT: 'SUSPECT',
    OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
    FAULT: 'FAULT',
  }),

  // UI Semantic Color Tokens
  THEME_COLORS: Object.freeze({
    NOMINAL: '#7A9471',      // Moss Green
    NOMINAL_DIM: '#4E5F49',
    WATCH: '#C9A227',        // Nutrient Amber
    ALERT: '#C1622C',        // Earth Terracotta
    ALERT_DIM: '#6B3719',
    WATER: '#4C87A6',        // Basin Blue
    WATER_DIM: '#33586B',
    INK: '#EDE8DE',
    INK_DIM: '#A69E8D',
    INK_FAINT: '#726B5C',
    PANEL: '#1C1914',
    PANEL_RAISED: '#23201A',
    BG: '#14120F',
    HAIRLINE: '#35312A',
  }),

  // Standard Metric Specifications
  METRIC_TYPES: Object.freeze({
    MOISTURE: {
      type: 'moisture',
      name: 'Soil Moisture',
      unit: '%',
      minValid: 0,
      maxValid: 100,
      precision: 1,
      defaultThresholds: { criticalLow: 20, warningLow: 35, warningHigh: 85, criticalHigh: 95, hysteresis: 2 }
    },
    WATER_LEVEL: {
      type: 'water',
      name: 'Water Level',
      unit: '%',
      minValid: 0,
      maxValid: 100,
      precision: 1,
      defaultThresholds: { criticalLow: 20, warningLow: 35, warningHigh: 90, criticalHigh: 98, hysteresis: 2 }
    },
    NITROGEN: {
      type: 'nitrogen',
      name: 'Soil Nitrogen (N)',
      unit: '%',
      minValid: 0,
      maxValid: 100,
      precision: 0,
      defaultThresholds: { criticalLow: 25, warningLow: 40, warningHigh: 85, criticalHigh: 95, hysteresis: 3 }
    },
    PHOSPHORUS: {
      type: 'phosphorus',
      name: 'Soil Phosphorus (P)',
      unit: '%',
      minValid: 0,
      maxValid: 100,
      precision: 0,
      defaultThresholds: { criticalLow: 20, warningLow: 35, warningHigh: 80, criticalHigh: 92, hysteresis: 3 }
    },
    POTASSIUM: {
      type: 'potassium',
      name: 'Soil Potassium (K)',
      unit: '%',
      minValid: 0,
      maxValid: 100,
      precision: 0,
      defaultThresholds: { criticalLow: 25, warningLow: 45, warningHigh: 90, criticalHigh: 98, hysteresis: 3 }
    },
    AMBIENT_HUMIDITY: {
      type: 'humidity',
      name: 'Ambient Humidity',
      unit: '%',
      minValid: 5,
      maxValid: 100,
      precision: 1,
      defaultThresholds: { criticalLow: 20, warningLow: 30, warningHigh: 85, criticalHigh: 95, hysteresis: 2 }
    },
    AMBIENT_TEMPERATURE: {
      type: 'temp',
      name: 'Surface Temperature',
      unit: '°C',
      minValid: -10,
      maxValid: 60,
      precision: 1,
      defaultThresholds: { criticalLow: 12, warningLow: 16, warningHigh: 34, criticalHigh: 40, hysteresis: 1 }
    }
  }),

  // Firebase Firestore Collection Paths
  FIRESTORE_PATHS: Object.freeze({
    SENSORS_COLLECTION: 'sensors',
    READINGS_SUBCOLLECTION: 'readings',
    STATIONS_COLLECTION: 'stations',
    SENSORS_SUBCOLLECTION: 'sensors',
  }),

  // Operational Environment (Production Mode - No Mock / Simulated Data)
  ENVIRONMENT: 'production',

  // Secure Intelligence Gateway (Cloudflare Worker Proxy)
  AI_GATEWAY: Object.freeze({
    // Cloudflare Worker endpoint for authenticated proxying
    WORKER_ENDPOINT: 'https://shamba-watch-proxy.lawyerai.workers.dev/api/inference',
    SERVICE_KEY: 'inference',
    REQUEST_TIMEOUT_MS: 30000,
    MAX_TOKENS: 1200,
    TEMPERATURE: 0.2,
  }),

  // Verbose Logging Levels for Instant Troubleshooting
  LOG_LEVEL: 'DEBUG', // 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
});

/**
 * Lightweight structured logger adhering to Principle 19.
 */
export class Logger {
  static debug(context, message, data = null) {
    if (APP_CONFIG.LOG_LEVEL === 'DEBUG') {
      console.debug(`[DEBUG][${context}] ${message}`, data || '');
    }
  }

  static info(context, message, data = null) {
    if (['DEBUG', 'INFO'].includes(APP_CONFIG.LOG_LEVEL)) {
      console.info(`[INFO][${context}] ${message}`, data || '');
    }
  }

  static warn(context, message, data = null) {
    if (['DEBUG', 'INFO', 'WARN'].includes(APP_CONFIG.LOG_LEVEL)) {
      console.warn(`[WARN][${context}] ${message}`, data || '');
    }
  }

  static error(context, message, error = null) {
    console.error(`[ERROR][${context}] ${message}`, error || '');
  }
}
