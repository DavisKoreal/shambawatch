/**
 * Shamba Watch 2.0 — Structured Correlation Logger
 * Adheres to Rules 19 (Structured Logging), 57 (Distributed Tracing),
 * and 58 (Correlation ID Propagation).
 */

export class StructuredLogger {
  /**
   * @param {string|Object} [serviceNameOrOptions='Global'] - Owning service identifier or configuration object
   * @param {Object} [defaultContext={}] - Base contextual properties
   */
  constructor(serviceNameOrOptions = 'Global', defaultContext = {}) {
    if (typeof serviceNameOrOptions === 'object' && serviceNameOrOptions !== null) {
      this._serviceName = serviceNameOrOptions.serviceName || 'Global';
      this._minLevel = serviceNameOrOptions.minLevel || 'DEBUG';
      this._outputHandler = serviceNameOrOptions.outputHandler || null;
      this._defaultContext = serviceNameOrOptions.defaultContext || {};
    } else {
      this._serviceName = serviceNameOrOptions;
      this._minLevel = 'DEBUG';
      this._outputHandler = null;
      this._defaultContext = defaultContext;
    }
  }

  /**
   * Directly sets trace and correlation IDs on the logger instance.
   * @param {string} traceId
   * @param {string} [correlationId]
   */
  setTraceContext(traceId, correlationId = null) {
    this._defaultContext.traceId = traceId;
    this._defaultContext.correlationId = correlationId || traceId;
  }

  /**
   * Create a child logger with bound correlation and trace IDs.
   * @param {string} correlationId
   * @param {string} [traceId]
   * @returns {StructuredLogger}
   */
  withContext(correlationId, traceId = null) {
    return new StructuredLogger(this._serviceName, {
      ...this._defaultContext,
      correlationId,
      traceId: traceId || correlationId
    });
  }

  /**
   * Internal structured log formatter.
   * @private
   */
  _log(level, message, details = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      service: this._serviceName,
      level,
      message,
      correlationId: this._defaultContext.correlationId || null,
      traceId: this._defaultContext.traceId || null,
      ...(details && typeof details === 'object' ? details : (details ? { details } : {}))
    };

    if (typeof this._outputHandler === 'function') {
      this._outputHandler(level, entry);
      return entry;
    }

    const prefix = `[${level}][${this._serviceName}]`;
    const tag = entry.correlationId ? `[${entry.correlationId}]` : '';

    if (level === 'ERROR') {
      console.error(`${prefix}${tag} ${message}`, details || '');
    } else if (level === 'WARN') {
      console.warn(`${prefix}${tag} ${message}`, details || '');
    } else {
      console.log(`${prefix}${tag} ${message}`, details || '');
    }

    return entry;
  }

  info(message, details = null) {
    return this._log('INFO', message, details);
  }

  warn(message, details = null) {
    return this._log('WARN', message, details);
  }

  error(message, details = null) {
    return this._log('ERROR', message, details);
  }

  debug(message, details = null) {
    return this._log('DEBUG', message, details);
  }
}
