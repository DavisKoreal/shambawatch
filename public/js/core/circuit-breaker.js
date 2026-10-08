/**
 * Shamba Watch 2.0 — Circuit Breaker Pattern
 * Adheres to Rule 48 (Circuit Breaker) and Rule 18 (Explicit Exception Handling).
 * States: CLOSED (Normal), OPEN (Failing -> fast fallback), HALF_OPEN (Trial probe).
 */

import { StructuredLogger } from './structured-logger.js';
import { createErrorEnvelope, ServiceErrorCode } from '../contracts/service-envelope.js';

export const CircuitState = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
});

export const CircuitBreakerState = CircuitState;

export class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {string} [options.name='default'] - Protected resource/endpoint name
   * @param {number} [options.failureThreshold=3] - Number of consecutive errors before opening circuit
   * @param {number} [options.resetTimeoutMs=10000] - Duration to stay in OPEN state before trying HALF_OPEN
   * @param {number} [options.recoveryTimeoutMs] - Alias for resetTimeoutMs
   * @param {(...args: any[]) => Promise<any>} [options.fallback] - Fallback handler when OPEN
   * @param {(...args: any[]) => Promise<any>} [options.fallbackHandler] - Alias for fallback
   */
  constructor({ name = 'default', failureThreshold = 3, resetTimeoutMs, recoveryTimeoutMs = 10000, fallback, fallbackHandler = null } = {}) {
    this._name = name;
    this._failureThreshold = failureThreshold;
    this._resetTimeoutMs = resetTimeoutMs ?? recoveryTimeoutMs;
    this._fallback = fallback ?? fallbackHandler;

    this._state = CircuitState.CLOSED;
    this._consecutiveFailures = 0;
    this._nextAttemptTime = 0;
    this._logger = new StructuredLogger(`CircuitBreaker:${name}`);
  }

  get state() {
    if (this._state === CircuitState.OPEN && Date.now() >= this._nextAttemptTime) {
      return CircuitState.HALF_OPEN;
    }
    return this._state;
  }

  getState() {
    return this.state;
  }

  /**
   * Executes an async operation protected by the circuit breaker.
   * @template T
   * @param {(...args: any[]) => Promise<T>} action
   * @param {...any} args
   * @returns {Promise<T>}
   */
  async execute(action, ...args) {
    const now = Date.now();

    // Check if OPEN state should transition to HALF_OPEN
    if (this._state === CircuitState.OPEN) {
      if (now >= this._nextAttemptTime) {
        this._state = CircuitState.HALF_OPEN;
        this._logger.info(`Circuit entering HALF_OPEN state; executing probe call.`);
      } else {
        // Fast-fail or fallback
        if (typeof this._fallback === 'function') {
          return await this._fallback(...args);
        }
        throw new Error(`CircuitBreaker [${this._name}] is OPEN. Fast-failing downstream request.`);
      }
    }

    try {
      const result = await action(...args);
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      throw err;
    }
  }

  /**
   * Internal success handler.
   * @private
   */
  _onSuccess() {
    this._consecutiveFailures = 0;
    if (this._state === CircuitState.HALF_OPEN) {
      this._state = CircuitState.CLOSED;
      this._logger.info(`Probe succeeded. Circuit reset to CLOSED state.`);
    }
  }

  /**
   * Internal failure handler.
   * @private
   * @param {Error} err
   */
  _onFailure(err) {
    this._consecutiveFailures += 1;
    this._logger.warn(`Failure recorded (${this._consecutiveFailures}/${this._failureThreshold}): ${err.message}`);

    if (this._consecutiveFailures >= this._failureThreshold || this._state === CircuitState.HALF_OPEN) {
      this._state = CircuitState.OPEN;
      this._nextAttemptTime = Date.now() + this._resetTimeoutMs;
      this._logger.error(`Failure threshold reached! Circuit trip to OPEN state until ${new Date(this._nextAttemptTime).toISOString()}`);
    }
  }

  /**
   * Manually reset the circuit breaker.
   */
  reset() {
    this._state = CircuitState.CLOSED;
    this._consecutiveFailures = 0;
    this._nextAttemptTime = 0;
  }
}
