/**
 * Shamba Watch 2.0 — Theme Toggle View Controller
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 * Synchronizes all theme toggle triggers across Marketing and App Shell views.
 */

export class ThemeToggleView {
  /**
   * @param {Object} dependencies
   * @param {import('../services/theme-service.js').ThemeService} dependencies.themeService
   */
  constructor({ themeService }) {
    this._themeService = themeService;
    this._bindEvents();
    this.updateUI(this._themeService.currentTheme);
  }

  _bindEvents() {
    // Delegated click listener ensures both initial and dynamically mounted buttons work seamlessly
    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.theme-toggle-btn');
      if (toggleBtn) {
        e.preventDefault();
        this._themeService.toggleTheme();
      }
    });
  }

  /**
   * Updates button labels, titles, and aria attributes across all toggle instances.
   * @param {'dark'|'light'} theme
   */
  updateUI(theme) {
    const isLight = theme === 'light';
    const labelText = isLight ? 'Light' : 'Dark';
    const tooltip = `Active: ${isLight ? 'Light Mode' : 'Dark Mode'} (click to toggle)`;

    const buttons = document.querySelectorAll('.theme-toggle-btn');
    buttons.forEach((btn) => {
      btn.setAttribute('aria-pressed', isLight);
      btn.setAttribute('title', tooltip);
      const textSpan = btn.querySelector('#themeToggleText, .theme-toggle-text, .mkt-theme-toggle-text');
      if (textSpan) {
        textSpan.textContent = labelText;
      }
    });
  }
}
