/**
 * Shamba Watch 2.0 — Theme Toggle View Controller
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 */

export class ThemeToggleView {
  /**
   * @param {Object} dependencies
   * @param {import('../services/theme-service.js').ThemeService} dependencies.themeService
   */
  constructor({ themeService }) {
    this._themeService = themeService;
    this._toggleBtn = document.getElementById('themeToggleBtn');
    this._toggleText = document.getElementById('themeToggleText');

    this._bindEvents();
    this.updateUI(this._themeService.currentTheme);
  }

  _bindEvents() {
    if (this._toggleBtn) {
      this._toggleBtn.addEventListener('click', () => {
        this._themeService.toggleTheme();
      });
    }
  }

  /**
   * Updates button label, title, and aria attributes.
   * @param {'dark'|'light'} theme
   */
  updateUI(theme) {
    if (this._toggleText) {
      this._toggleText.textContent = theme === 'light' ? 'Light' : 'Dark';
    }
    if (this._toggleBtn) {
      this._toggleBtn.setAttribute('aria-pressed', theme === 'light');
      this._toggleBtn.setAttribute('title', `Active: ${theme === 'light' ? 'Light Mode' : 'Dark Mode'} (click to toggle)`);
    }
  }
}
