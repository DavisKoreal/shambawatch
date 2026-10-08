/**
 * @fileoverview AuthModal — User Authentication Dialog for Shamba Watch.
 * Provides Email/Password sign in, registration, role selection, and quick demo logins.
 * Adheres to Rules 1 (SRP), 6 (Low Cyclomatic Complexity), and 34 (Interface Adapters).
 */

import { UserRole } from '../services/auth-service.js';
import { Icons } from './icons.js';

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

          <!-- QUICK DEMO LOGINS -->
          <div class="auth-demo-divider">
            <span>Quick Demonstration Logins</span>
          </div>

          <div class="auth-demo-buttons">
            <button class="btn-demo demo-admin-btn" type="button" id="demoAdminBtn">
              <span class="demo-icon">${Icons.crown({ size: 18 })}</span>
              <div class="demo-btn-text">
                <strong>Sign in as Admin</strong>
                <small>admin@shambawatch.org (All Stations & Management)</small>
              </div>
            </button>
            <button class="btn-demo demo-farmer-btn" type="button" id="demoFarmerBtn">
              <span class="demo-icon">${Icons.sprout({ size: 18 })}</span>
              <div class="demo-btn-text">
                <strong>Sign in as Farmer</strong>
                <small>farmer@shambawatch.org (Single Station Subscriber)</small>
              </div>
            </button>
          </div>

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
    const demoAdminBtn = this._mountEl.querySelector('#demoAdminBtn');
    const demoFarmerBtn = this._mountEl.querySelector('#demoFarmerBtn');
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

    // Demo Logins
    demoAdminBtn?.addEventListener('click', async () => {
      demoAdminBtn.disabled = true;
      demoAdminBtn.style.opacity = '0.6';
      this._clearError();
      const res = await this._authService.quickSignInDemo('admin');
      demoAdminBtn.disabled = false;
      demoAdminBtn.style.opacity = '1';
      if (res.error) {
        this._showError(res.error.message);
      } else {
        this.close();
      }
    });

    demoFarmerBtn?.addEventListener('click', async () => {
      demoFarmerBtn.disabled = true;
      demoFarmerBtn.style.opacity = '0.6';
      this._clearError();
      const res = await this._authService.quickSignInDemo('farmer');
      demoFarmerBtn.disabled = false;
      demoFarmerBtn.style.opacity = '1';
      if (res.error) {
        this._showError(res.error.message);
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
