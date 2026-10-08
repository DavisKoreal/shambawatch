/**
 * Shamba Watch 2.0 — Service Registry & IoC Container
 * Adheres to Rules 36 (Dependency Injection / Inversion of Control)
 * and 49 (Service Discovery).
 */

import { StructuredLogger } from './structured-logger.js';

export class ServiceRegistry {
  constructor() {
    /** @type {Map<string, Object>} */
    this._services = new Map();
    /** @type {Map<string, () => Object>} */
    this._factories = new Map();
    /** @type {Map<string, () => Object>} */
    this._transientFactories = new Map();
    this._logger = new StructuredLogger('ServiceRegistry');
  }

  /**
   * Registers a service instance or factory.
   * @param {string} serviceName - Unique contract name
   * @param {Object|(() => Object)} instanceOrFactory - Service implementation or factory
   * @param {Object} [options={}]
   * @param {boolean} [options.singleton=true]
   * @returns {this}
   */
  register(serviceName, instanceOrFactory, options = {}) {
    if (!serviceName || !instanceOrFactory) {
      throw new TypeError('ServiceRegistry.register requires a serviceName and valid instance or factory.');
    }
    const isFactory = typeof instanceOrFactory === 'function';
    const isSingleton = options.singleton !== false;

    if (isFactory) {
      if (isSingleton) {
        this._factories.set(serviceName, instanceOrFactory);
      } else {
        this._transientFactories.set(serviceName, instanceOrFactory);
      }
    } else {
      this._services.set(serviceName, instanceOrFactory);
    }
    this._logger.debug(`Registered service: ${serviceName}`);
    return this;
  }

  /**
   * Registers a lazy service factory.
   * @param {string} serviceName
   * @param {() => Object} factory
   * @returns {this}
   */
  registerFactory(serviceName, factory) {
    return this.register(serviceName, factory, { singleton: true });
  }

  /**
   * Discovers and retrieves a registered service by name.
   * @template T
   * @param {string} serviceName
   * @returns {T}
   */
  get(serviceName) {
    if (this._services.has(serviceName)) {
      return /** @type {T} */ (this._services.get(serviceName));
    }

    if (this._transientFactories.has(serviceName)) {
      const factory = this._transientFactories.get(serviceName);
      return /** @type {T} */ (factory());
    }

    if (this._factories.has(serviceName)) {
      const factory = this._factories.get(serviceName);
      const instance = factory();
      this._services.set(serviceName, instance);
      return /** @type {T} */ (instance);
    }

    throw new Error(`Service [${serviceName}] was not found in the ServiceRegistry.`);
  }

  /**
   * Alias for get() in standard IoC containers.
   * @template T
   * @param {string} serviceName
   * @returns {T}
   */
  resolve(serviceName) {
    return this.get(serviceName);
  }

  /**
   * Checks whether a service is registered.
   * @param {string} serviceName
   * @returns {boolean}
   */
  has(serviceName) {
    return this._services.has(serviceName) || this._factories.has(serviceName) || this._transientFactories.has(serviceName);
  }

  /**
   * Disposes all registered services that implement dispose/destroy (Rule 15).
   */
  dispose() {
    this._services.forEach((service, name) => {
      if (typeof service.dispose === 'function') {
        try {
          service.dispose();
        } catch (err) {
          this._logger.error(`Error disposing service ${name}:`, err);
        }
      } else if (typeof service.destroy === 'function') {
        try {
          service.destroy();
        } catch (err) {
          this._logger.error(`Error destroying service ${name}:`, err);
        }
      }
    });
    this._services.clear();
    this._factories.clear();
    this._transientFactories.clear();
  }

  /**
   * Alias for dispose()
   */
  disposeAll() {
    this.dispose();
  }
}
