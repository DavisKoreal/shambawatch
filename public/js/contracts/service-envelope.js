/**
 * Shamba Watch 2.0 — Standard Service Envelope & Typed Contracts
 * Adheres to Rules 9 (Static Typing), 10 (Docstrings), 13 (Consistent Return Types), 
 * 24 (Custom Error Messages), and 60 (API Versioning).
 */

/**
 * Standard Service Error Codes
 * @readonly
 * @enum {string}
 */
export const ServiceErrorCode = Object.freeze({
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TIMEOUT: 'TIMEOUT',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED'
});

/**
 * Default API / Service Contract Version
 */
export const CONTRACT_VERSION = 'v1.0.0';

/**
 * Generates an immutable, distributed trace or correlation ID.
 * @param {string} [prefix='corr']
 * @returns {string}
 */
export function generateTraceId(prefix = 'trace') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generates an immutable correlation ID.
 * @param {string} [prefix='corr']
 * @returns {string}
 */
export function generateCorrelationId(prefix = 'corr') {
  return generateTraceId(prefix);
}

/**
 * Encapsulates successful service execution into a standardized envelope.
 * @template T
 * @param {T} data - The payload returned by the service
 * @param {Object} [meta={}] - Contextual metadata
 * @param {string} [meta.correlationId]
 * @param {string} [meta.traceId]
 * @param {string} [meta.version=CONTRACT_VERSION]
 * @returns {{
 *   success: true,
 *   data: T,
 *   error: null,
 *   correlationId: string,
 *   traceId: string,
 *   timestamp: string,
 *   version: string,
 *   metadata: Object
 * }}
 */
export function createSuccessEnvelope(data, meta = {}) {
  const traceId = meta.traceId || generateTraceId('trace');
  const correlationId = meta.correlationId || generateCorrelationId('corr');
  const timestamp = new Date().toISOString();
  const version = meta.version || CONTRACT_VERSION;
  return {
    success: true,
    data,
    error: null,
    correlationId,
    traceId,
    timestamp,
    version,
    metadata: {
      ...meta,
      traceId,
      correlationId,
      timestamp,
      version
    }
  };
}

/**
 * Encapsulates service failures into a standardized, actionable error envelope.
 * @param {string} code - High-level error code from ServiceErrorCode
 * @param {string} message - Clear, actionable error description (Rule 24)
 * @param {Object} [details=null] - Additional machine-readable diagnostic details
 * @param {Object} [meta={}] - Contextual metadata
 * @param {string} [meta.correlationId]
 * @param {string} [meta.traceId]
 * @param {string} [meta.version=CONTRACT_VERSION]
 * @returns {{
 *   success: false,
 *   data: null,
 *   error: {
 *     code: string,
 *     message: string,
 *     details: Object|null
 *   },
 *   correlationId: string,
 *   traceId: string,
 *   timestamp: string,
 *   version: string,
 *   metadata: Object
 * }}
 */
export function createErrorEnvelope(code, message, details = null, meta = {}) {
  const traceId = meta.traceId || generateTraceId('trace');
  const correlationId = meta.correlationId || generateCorrelationId('corr');
  const timestamp = new Date().toISOString();
  const version = meta.version || CONTRACT_VERSION;
  return {
    success: false,
    data: null,
    error: {
      code: code || ServiceErrorCode.INTERNAL_ERROR,
      message: message || 'An unexpected service error occurred.',
      details
    },
    correlationId,
    traceId,
    timestamp,
    version,
    metadata: {
      ...meta,
      traceId,
      correlationId,
      timestamp,
      version
    }
  };
}
