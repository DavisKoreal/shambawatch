/**
 * Shamba Watch 2.0 — Asynchronous Event Types & Schemas
 * Adheres to Rules 44 (Service Contracts), 46 (Event-Driven Communication),
 * 56 (Asynchronous Messaging), and 60 (API Versioning).
 */

/**
 * Canonical Event Types Enum
 * @readonly
 * @enum {string}
 */
export const EventTypes = Object.freeze({
  // Station Bounded Context Events
  STATION_SELECTED: 'station:selected:v1',
  STATION_DISCOVERED: 'station:discovered:v1',
  STATION_TOPOLOGY_UPDATED: 'station:topology_updated:v1',

  // Telemetry Bounded Context Events
  TELEMETRY_INGESTED: 'telemetry:ingested:v1',
  SENSOR_DISCOVERED: 'telemetry:sensor_discovered:v1',
  STREAM_STATUS_CHANGED: 'telemetry:stream_status_changed:v1',

  // Analytics Bounded Context Events
  WINDOW_CHANGED: 'analytics:window_changed:v1',
  METRIC_CHANGED: 'analytics:metric_changed:v1',

  // Geospatial GIS Events
  LAYER_CHANGED: 'map:layer_changed:v1',
  MAP_VIEW_RESET: 'map:view_reset:v1',

  // User Preferences & Theme Events
  THEME_CHANGED: 'theme:changed:v1',

  // Monitoring & Alert Events
  // Monitoring & Alert Events
  ALERT_TRIGGERED: 'alert:triggered:v1',
  ALERT_RAISED: 'alert:triggered:v1',
  ALERT_CLEARED: 'alert:cleared:v1'
});

/**
 * Creates a versioned, traceable event envelope for asynchronous publication.
 * @template T
 * @param {string} type - Canonical event type identifier from EventTypes
 * @param {T} payload - Immutable event data payload
 * @param {Object} [meta={}]
 * @param {string} [meta.sourceService] - The service originating this event
 * @param {string} [meta.source]
 * @param {string} [meta.correlationId]
 * @param {string} [meta.traceId]
 * @returns {{
 *   id: string,
 *   type: string,
 *   eventType: string,
 *   payload: T,
 *   source: string,
 *   sourceService: string,
 *   correlationId: string,
 *   traceId: string,
 *   timestamp: string,
 *   version: string
 * }}
 */
export function createEventEnvelope(type, payload, metaOrSource = {}, extraMeta = {}) {
  let meta = {};
  let source = 'unknown-service';

  if (typeof metaOrSource === 'string') {
    source = metaOrSource;
    meta = extraMeta || {};
  } else {
    meta = metaOrSource || {};
    source = meta.source || meta.sourceService || 'unknown-service';
  }

  const traceId = meta.traceId || `ev_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  return {
    id: traceId,
    type,
    eventType: type,
    payload: Object.freeze(payload),
    source,
    sourceService: source,
    correlationId: meta.correlationId || traceId,
    traceId,
    timestamp: new Date().toISOString(),
    version: meta.version || '1.0.0'
  };
}
