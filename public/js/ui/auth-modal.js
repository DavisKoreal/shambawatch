/**
 * @fileoverview AuthModal — User Authentication Dialog for Shamba Watch.
 * Provides Email/Password sign in, registration, and role selection.
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 */

import { UserRole } from '../services/auth-service.js';

export class AuthModal {
  /**
   * @param {Object} dependencies
   * @param {import('../services/auth-service.js').AuthService} dependencies.authService
   * @param {import('../services/station-service.js').StationService} dependencies.stationService
   * @param {HTMLElement} dependencies.mountEl
   */
  constructor({ authService, stationService, mountEl }) {
    this._authService = authService;
    this._stationService = stationService;
    this._mountEl = mountEl;
    this._activeTab = 'signin'; // 'signin' | 'signup'
    this._isOpen = false;

    this._render();
    this._bindEvents();
  }

  /**
   * Opens the auth modal.
   * @param {'signin'|'signup'} [defaultTab='signin']
   */
  open(defaultTab = 'signin') {
    this._activeTab = defaultTab;
    this._isOpen = true;
    this._updateTabUI();
    const modal = this._mountEl.querySelector('.shamba-modal-overlay');
    if (modal) {
      modal.classList.add('open');
      const firstInput = modal.querySelector('input');
      if (firstInput) setTimeout(() => firstInput.focus(), 100);
    }
  }

  /**
   * Closes the auth modal.
   */
  close() {
    this._isOpen = false;
    const modal = this._mountEl.querySelector('.shamba-modal-overlay');
    if (modal) {
      modal.classList.remove('open');
      this._clearError();
    }
  }

  /**
   * Renders the modal DOM.
   * @private
   */
  _render() {
    this._mountEl.innerHTML = `
      <div class="shamba-modal-overlay" id="authModalOverlay" aria-modal="true" role="dialog">
        <div class="shamba-modal-content auth-modal-box">
          <button class="shamba-modal-close" id="authModalCloseBtn" type="button" aria-label="Close dialog">×</button>
          
          <div class="auth-modal-header">
            <div class="auth-brand-badge">S</div>
            <h3 class="auth-modal-title">Shamba Watch Access</h3>
            <p class="auth-modal-sub">Role-Based Access for Admins & Farmers</p>
          </div>

          <!-- Auth Tabs -->
          <div class="auth-tabs">
            <button class="auth-tab-btn active" id="authTabSignIn" type="button">Sign In</button>
            <button class="auth-tab-btn" id="authTabSignUp" type="button">Create Account</button>
          </div>

          <!-- Error Alert Banner -->
          <div class="auth-error-banner" id="authErrorBanner" style="display:none;"></div>

          <!-- SIGN IN FORM -->
          <form class="auth-form" id="signInForm">
            <div class="form-group">
              <label for="signInEmail">Email Address</label>
              <input type="email" id="signInEmail" placeholder="e.g. farmer@shambawatch.org" required autocomplete="email">
            </div>
            <div class="form-group">
              <label for="signInPassword">Password</label>
              <input type="password" id="signInPassword" placeholder="••••••••" required autocomplete="current-password">
            </div>
            <button class="btn-primary auth-submit-btn" type="submit" id="signInSubmitBtn">
              Sign In to Station
            </button>
          </form>

          <!-- SIGN UP FORM -->
          <form class="auth-form" id="signUpForm" style="display:none;">
            <div class="form-group">
              <label for="signUpName">Full Name</label>
              <input type="text" id="signUpName" placeholder="e.g. Wanjiku Kamau" required>
            </div>
            <div class="form-group">
              <label for="signUpEmail">Email Address</label>
              <input type="email" id="signUpEmail" placeholder="e.g. wanjiku@shambawatch.org" required autocomplete="email">
            </div>
            <div class="form-group">
              <label for="signUpPassword">Password (6+ characters)</label>
              <input type="password" id="signUpPassword" placeholder="••••••••" required minlength="6" autocomplete="new-password">
            </div>
            
            <div class="form-group">
              <label for="signUpRole">Platform Role</label>
              <select id="signUpRole">
                <option value="farmer">Farmer (Station Subscriber)</option>
                <option value="admin">System Administrator (Full Management)</option>
              </select>
            </div>

            <div class="form-group" id="farmerStationSelectGroup">
              <label for="signUpStation">Assign Initial Station (Optional)</label>
              <select id="signUpStation">
                <option value="">-- Select Station --</option>
              </select>
            </div>

            <button class="btn-primary auth-submit-btn" type="submit" id="signUpSubmitBtn">
              Create Account
            </button>
          </form>

        </div>
      </div>
    `;
  }

  /**
   * Binds interaction listeners.
   * @private
   */
  _bindEvents() {
    const overlay = this._mountEl.querySelector('#authModalOverlay');
    const closeBtn = this._mountEl.querySelector('#authModalCloseBtn');
    const tabSignIn = this._mountEl.querySelector('#authTabSignIn');
    const tabSignUp = this._mountEl.querySelector('#authTabSignUp');
    const signInForm = this._mountEl.querySelector('#signInForm');
    const signUpForm = this._mountEl.querySelector('#signUpForm');
    const signUpRole = this._mountEl.querySelector('#signUpRole');

    // Close on overlay click or close button
    closeBtn?.addEventListener('click', () => this.close());
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // ESC key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) this.close();
    });

    // Tabs toggle
    tabSignIn?.addEventListener('click', () => {
      this._activeTab = 'signin';
      this._updateTabUI();
    });
    tabSignUp?.addEventListener('click', () => {
      this._activeTab = 'signup';
      this._updateTabUI();
      this._populateStationSelect();
    });

    // Show/hide station select based on role
    signUpRole?.addEventListener('change', () => {
      const group = this._mountEl.querySelector('#farmerStationSelectGroup');
      if (group) {
        group.style.display = signUpRole.value === 'farmer' ? 'block' : 'none';
      }
    });

    // Sign In Submit
    signInForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = this._mountEl.querySelector('#signInEmail').value.trim();
      const password = this._mountEl.querySelector('#signInPassword').value;
      const submitBtn = this._mountEl.querySelector('#signInSubmitBtn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
      this._clearError();

      const res = await this._authService.signIn(email, password);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In to Station';

      if (res.error) {
        this._showError(res.error.message || 'Invalid email or password.');
      } else {
        this.close();
      }
    });

    // Sign Up Submit
    signUpForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = this._mountEl.querySelector('#signUpName').value.trim();
      const email = this._mountEl.querySelector('#signUpEmail').value.trim();
      const password = this._mountEl.querySelector('#signUpPassword').value;
      const role = this._mountEl.querySelector('#signUpRole').value;
      const station = this._mountEl.querySelector('#signUpStation').value;
      const submitBtn = this._mountEl.querySelector('#signUpSubmitBtn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';
      this._clearError();

      const res = await this._authService.signUp(email, password, {
        displayName: name,
        role,
        assignedStationId: role === 'farmer' ? (station || null) : null
      });

      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';

      if (res.error) {
        this._showError(res.error.message || 'Failed to create account.');
      } else {
        this.close();
      }
    });
  }

  /**
   * Updates tab visibility and inputs.
   * @private
   */
  _updateTabUI() {
    const tabSignIn = this._mountEl.querySelector('#authTabSignIn');
    const tabSignUp = this._mountEl.querySelector('#authTabSignUp');
    const signInForm = this._mountEl.querySelector('#signInForm');
    const signUpForm = this._mountEl.querySelector('#signUpForm');

    if (this._activeTab === 'signin') {
      tabSignIn?.classList.add('active');
      tabSignUp?.classList.remove('active');
      if (signInForm) signInForm.style.display = 'block';
      if (signUpForm) signUpForm.style.display = 'none';
    } else {
      tabSignUp?.classList.add('active');
      tabSignIn?.classList.remove('active');
      if (signUpForm) signUpForm.style.display = 'block';
      if (signInForm) signInForm.style.display = 'none';
    }
    this._clearError();
  }

  /**
   * Populates stations dropdown for farmer signup.
   * @private
   */
  _populateStationSelect() {
    const sel = this._mountEl.querySelector('#signUpStation');
    if (!sel) return;
    const stations = this._stationService.getActiveStations();
    sel.innerHTML = '<option value="">-- Select Station --</option>' +
      stations.map((s) => `<option value="${s.id}">${s.name} (${s.id}) · ${s.crop || ''}</option>`).join('');
  }

  /**
   * Shows error in the modal banner.
   * @private
   */
  _showError(msg) {
    const banner = this._mountEl.querySelector('#authErrorBanner');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = 'block';
    }
  }

  /**
   * Clears error banner.
   * @private
   */
  _clearError() {
    const banner = this._mountEl.querySelector('#authErrorBanner');
    if (banner) {
      banner.textContent = '';
      banner.style.display = 'none';
    }
  }
}
