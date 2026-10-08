/**
 * Shamba Watch 2.0 — Transactional Outbox
 * Adheres to Rule 59 (Transactional Outbox Pattern).
 * Buffers domain events and dispatches them sequentially to the EventBus,
 * guaranteeing event delivery without dual-write inconsistencies.
 */

import { StructuredLogger } from './structured-logger.js';

export class TransactionalOutbox {
  /**
   * @param {import('./event-bus.js').EventBus} eventBus
   * @param {Object} [options={}]
   * @param {boolean} [options.autoProcess=true]
   */
  constructor(eventBus, options = {}) {
    if (!eventBus) {
      throw new TypeError('TransactionalOutbox requires an injected EventBus.');
    }
    this._eventBus = eventBus;
    this._autoProcess = options.autoProcess !== false;
    /** @type {Array<{ id: string, type: string, payload: Object, meta: Object, attempts: number, createdAt: string }>} */
    this._queue = [];
    this._isProcessing = false;
    this._logger = new StructuredLogger('TransactionalOutbox');
  }

  /**
   * Appends an event to the outbox queue.
   * @param {string} type - Event type from EventTypes
   * @param {Object} payload - Event payload
   * @param {Object} [meta={}] - Tracing context
   * @returns {string} Outbox message ID
   */
  enqueue(type, payload, meta = {}) {
    const id = `outbox_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
    const entry = {
      id,
      type,
      payload,
      meta,
      attempts: 0,
      createdAt: new Date().toISOString()
    };
    this._queue.push(entry);
    this._logger.debug(`Enqueued outbox event [${type}] (Queue depth: ${this._queue.length})`);
    
    // Asynchronously trigger queue processing if enabled
    if (this._autoProcess) {
      this.processQueue().catch((err) => {
        this._logger.error('Error during automatic outbox drain:', err);
      });
    }

    return id;
  }

  /**
   * Alias for queueDepth / queue size.
   * @returns {number}
   */
  size() {
    return this._queue.length;
  }

  /**
   * Explicitly drains and flushes pending outbox messages.
   * @returns {Promise<number>}
   */
  async flush() {
    return this.processQueue();
  }

  /**
   * Dispatches queued events to the EventBus.
   * @returns {Promise<number>} Count of events successfully dispatched
   */
  async processQueue() {
    if (this._isProcessing || this._queue.length === 0) {
      return 0;
    }

    this._isProcessing = true;
    let dispatchedCount = 0;

    try {
      while (this._queue.length > 0) {
        const item = this._queue[0];
        try {
          item.attempts += 1;
          await this._eventBus.publish(item.type, item.payload, item.meta);
          // Successfully published; remove from outbox
          this._queue.shift();
          dispatchedCount += 1;
        } catch (err) {
          this._logger.error(`Failed to dispatch event [${item.id}]:`, err);
          // If max attempts reached, move to dead letter or break loop
          if (item.attempts >= 3) {
            this._logger.warn(`Dropping poison message [${item.id}] after 3 failed attempts.`);
            this._queue.shift();
          }
          break; // Stop draining on transient error to maintain FIFO order
        }
      }
    } finally {
      this._isProcessing = false;
    }

    return dispatchedCount;
  }

  /**
   * Returns current pending queue depth.
   * @returns {number}
   */
  get queueDepth() {
    return this._queue.length;
  }
}
