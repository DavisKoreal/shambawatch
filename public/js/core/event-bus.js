/**
 * Shamba Watch 2.0 — Asynchronous EventBus
 * Adheres to Rules 15 (Resource Management), 18 (Explicit Exception Handling),
 * 46 (Event-Driven Communication), 50 (Bulkhead Isolation), 56 (Asynchronous Messaging),
 * 57 (Distributed Tracing), and 58 (Correlation ID Propagation).
 */

import { StructuredLogger } from './structured-logger.js';
import { createEventEnvelope } from '../contracts/event-types.js';

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<(event: Object) => void|Promise<void>>>} */
    this._subscribers = new Map();
    /** @type {Array<Object>} Dead-letter queue for events that caused handler exceptions */
    this._deadLetterQueue = [];
    this._logger = new StructuredLogger('EventBus');
  }

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function for RAII cleanup (Rule 15).
   * @param {string} eventType
   * @param {(event: Object) => void|Promise<void>} handler
   * @returns {() => void} Unsubscribe function
   */
  subscribe(eventType, handler) {
    if (!eventType || typeof handler !== 'function') {
      throw new TypeError('EventBus.subscribe requires a valid eventType string and handler function.');
    }

    if (!this._subscribers.has(eventType)) {
      this._subscribers.set(eventType, new Set());
    }

    const handlers = this._subscribers.get(eventType);
    handlers.add(handler);

    // RAII unsubscribe function (Rule 15)
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._subscribers.delete(eventType);
      }
    };
  }

  /**
   * Publishes an event asynchronously across subscribers with bulkhead isolation (Rule 50).
   * Even if one subscriber throws, others are unaffected and the error is logged to dead-letter queue.
   * @param {string} eventType
   * @param {Object} payload
   * @param {Object} [meta={}]
   * @returns {Promise<void>}
   */
  async publish(eventType, payload, meta = {}) {
    const envelope = createEventEnvelope(eventType, payload, meta);
    envelope.eventType = eventType;
    
    const specific = this._subscribers.get(eventType) || new Set();
    const wildcards = this._subscribers.get('*') || new Set();
    const allHandlers = new Set([...specific, ...wildcards]);

    if (allHandlers.size === 0) {
      return;
    }

    const executionPromises = Array.from(allHandlers).map(async (handler) => {
      try {
        await handler(envelope.payload, envelope);
      } catch (err) {
        // Bulkhead isolation (Rule 50) + explicit exception handling (Rule 18)
        this._logger.error(`Handler error during event [${eventType}] execution:`, {
          error: err.message,
          traceId: envelope.traceId,
          correlationId: envelope.correlationId
        });
        this._deadLetterQueue.push({
          envelope,
          eventType,
          error: err.message,
          failedAt: new Date().toISOString()
        });
      }
    });

    await Promise.all(executionPromises);
  }

  /**
   * Inspect dead-letter queue.
   * @returns {Array<Object>}
   */
  getDeadLetterQueue() {
    return [...this._deadLetterQueue];
  }

  /**
   * Clear all subscribers and dead letter queue (Resource cleanup - Rule 15).
   */
  clear() {
    this._subscribers.clear();
    this._deadLetterQueue = [];
  }
}
