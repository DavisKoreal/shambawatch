/**
 * Shamba Watch 2.0 — API Gateway Client
 * Adheres to Rules 43 (API Gateway), 48 (Circuit Breaker), 51 (Idempotency),
 * 57 (Distributed Tracing), 58 (Correlation ID), and 61 (Zero Trust Security).
 */

import { APP_CONFIG } from '../config/app-config.js';
import { StructuredLogger } from '../core/structured-logger.js';
import { CircuitBreaker } from '../core/circuit-breaker.js';
import { generateTraceId, createSuccessEnvelope, createErrorEnvelope, ServiceErrorCode } from '../contracts/service-envelope.js';

export class GatewayClient {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.endpoint]
   * @param {number} [options.timeoutMs=30000]
   */
  constructor(options = {}) {
    this._endpoint = options.endpoint || options.baseUrl || APP_CONFIG.AI_GATEWAY?.WORKER_ENDPOINT;
    this._timeoutMs = options.timeoutMs || APP_CONFIG.AI_GATEWAY?.REQUEST_TIMEOUT_MS || 30000;
    this._fetch = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    this._logger = new StructuredLogger('GatewayClient');

    // Protect remote endpoint with Circuit Breaker (Rule 48)
    this._circuitBreaker = new CircuitBreaker({
      name: 'CloudflareWorkerGateway',
      failureThreshold: 3,
      resetTimeoutMs: 15000,
      fallback: async (payload, meta) => {
        this._logger.warn('Circuit breaker fallback triggered for gateway request.');
        return createErrorEnvelope(ServiceErrorCode.CIRCUIT_OPEN, 'Inference Gateway circuit is open. Please try again shortly.', null, meta);
      }
    });
  }

  get circuitState() {
    return this._circuitBreaker.state;
  }

  /**
   * Dispatches an HTTP request through the API Gateway with zero trust, tracing, and idempotency headers.
   * @param {string} path
   * @param {Object} body
   * @param {Object} [meta={}]
   * @returns {Promise<Object>} ServiceEnvelope
   */
  async post(path = '', body = {}, meta = {}) {
    const traceId = meta.traceId || generateTraceId('tr');
    const correlationId = meta.correlationId || traceId;
    const idempotencyKey = meta.idempotencyKey || generateTraceId('idemp');

    const targetUrl = this._endpoint ? `${this._endpoint}${path}` : path;
    if (!targetUrl) {
      return createErrorEnvelope(ServiceErrorCode.INVALID_ARGUMENT, 'Gateway endpoint is not configured.', null, { correlationId, traceId });
    }

    return this._circuitBreaker.execute(async () => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), this._timeoutMs) : null;

      try {
        const fetchFn = this._fetch || (typeof fetch !== 'undefined' ? fetch : null);
        if (!fetchFn) {
          throw new Error('No fetch implementation available in current environment.');
        }

        const response = await fetchFn(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Trace-Id': traceId,
            'X-Trace-ID': traceId,
            'X-Correlation-Id': correlationId,
            'X-Correlation-ID': correlationId,
            'Idempotency-Key': idempotencyKey,
            'X-Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify(body),
          signal: controller ? controller.signal : undefined
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (!response.ok) {
          let errData = null;
          try {
            errData = await response.json();
          } catch {
            errData = await response.text();
          }
          throw new Error(`Gateway HTTP ${response.status}: ${JSON.stringify(errData)}`);
        }

        const data = await response.json();
        return createSuccessEnvelope(data, { correlationId, traceId });
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        throw err;
      }
    });
  }
}
