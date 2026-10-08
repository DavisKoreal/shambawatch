/**
 * Shamba Watch 2.0 — Theme Service (User Preferences Bounded Context)
 * Adheres to Rules 1 (SRP), 46 (Event-Driven), and 54 (Bounded Context).
 */

import { StructuredLogger } from '../core/structured-logger.js';
import { EventTypes } from '../contracts/event-types.js';
import { createSuccessEnvelope } from '../contracts/service-envelope.js';

export class ThemeService {
  /**
   * @param {Object} [dependencies={}]
   * @param {import('../core/event-bus.js').EventBus} [dependencies.eventBus]
   * @param {Object} [dependencies.storage] - Custom storage adapter for testing/SSR
   */
  constructor({ eventBus = null, storage = null } = {}) {
    this._eventBus = eventBus;
    this._storage = storage;
    this._logger = new StructuredLogger('ThemeService');
    this._activeTheme = 'dark';
    this._mediaQueryList = null;
  }

  get currentTheme() {
    return this._activeTheme;
  }

  getCurrentTheme() {
    return this._activeTheme;
  }

  /**
   * Initializes theme state from DOM, localStorage, or system media query.
   */
  init() {
    const rootTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
    let storedTheme = null;
    try {
      if (this._storage) {
        storedTheme = this._storage.getItem('shamba-theme');
      } else if (typeof localStorage !== 'undefined') {
        storedTheme = localStorage.getItem('shamba-theme');
      }
    } catch (e) {}

    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme || rootTheme || (systemDark ? 'dark' : 'light');

    this.setTheme(initialTheme, false);

    // Listen to OS system color-scheme changes if no manual preference stored
    try {
      this._mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      this._mediaQueryListener = (e) => {
        if (!localStorage.getItem('shamba-theme')) {
          this.setTheme(e.matches ? 'dark' : 'light', false);
        }
      };
      this._mediaQueryList.addEventListener('change', this._mediaQueryListener);
    } catch (e) {}

    this._logger.info(`ThemeService initialized with theme: ${initialTheme}`);
  }

  /**
   * Toggles between 'dark' and 'light' mode.
   * @returns {Promise<string>} Next theme
   */
  async toggleTheme() {
    const next = this._activeTheme === 'dark' ? 'light' : 'dark';
    await this.setTheme(next, true);
    return next;
  }

  /**
   * Explicitly sets theme.
   * @param {'dark'|'light'} theme
   * @param {boolean} [isUserAction=true]
   */
  async setTheme(theme, isUserAction = true) {
    this._activeTheme = theme;

    if (isUserAction && typeof document !== 'undefined') {
      document.documentElement.classList.add('theme-transitioning');
    }

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', theme);
    }

    if (isUserAction) {
      try {
        if (this._storage) {
          this._storage.setItem('shamba-theme', theme);
        } else if (typeof localStorage !== 'undefined') {
          localStorage.setItem('shamba-theme', theme);
        }
      } catch (e) {}

      setTimeout(() => {
        if (typeof document !== 'undefined') {
          document.documentElement.classList.remove('theme-transitioning');
        }
      }, 280);
    }

    if (this._eventBus) {
      await this._eventBus.publish(EventTypes.THEME_CHANGED, {
        theme,
        isUserAction
      }, { sourceService: 'ThemeService' });
    }

    return createSuccessEnvelope({ theme });
  }

  /**
   * Resource disposal (Rule 15).
   */
  dispose() {
    if (this._mediaQueryList && this._mediaQueryListener) {
      try {
        this._mediaQueryList.removeEventListener('change', this._mediaQueryListener);
      } catch (e) {}
    }
  }
}
